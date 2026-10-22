"""Encrypted application backup; offline restore never uses the source connection."""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

PG = Path('/usr/lib/postgresql/17/bin')
REQUIRED = {'public.profiles', 'public.user_storage', 'public.bug_reports', 'auth.users',
            'auth.identities', 'faintr_private.shared_teams', 'faintr_private.share_settings'}

def run(program, args, *, env=None, data=None):
    executable = str(PG / program) if program.startswith('pg_') or program == 'psql' else program
    result = subprocess.run([executable, *args], input=data, capture_output=True, env=env)
    if result.returncode:
        # COPY errors may contain an email or entire private row. Never log stderr.
        codes = re.findall(rb'(?:ERROR|FATAL):\s*([a-zA-Z ]+)', result.stderr)
        category = codes[0].decode().strip() if codes else 'check service configuration'
        raise RuntimeError(f'{program} failed ({result.returncode}; {category}). Private diagnostics withheld.')
    return result.stdout

def backup(output):
    if not os.environ.get('DB') or not os.environ.get('PASS'):
        raise RuntimeError('Database backup secrets are missing.')
    env = os.environ.copy()
    env['PGOPTIONS'] = '-c default_transaction_read_only=on'
    with tempfile.TemporaryDirectory(prefix='faintr-backup-') as tmp:
        archive = Path(tmp) / 'database.dump'
        # Preserve auth definitions needed by accounts, but exclude session/token data.
        tables = run('psql', [os.environ['DB'], '-XAt', '-v', 'ON_ERROR_STOP=1', '-c',
            "select tablename from pg_tables where schemaname='auth' and tablename not in ('users','identities')"], env=env).decode().splitlines()
        args = [os.environ['DB'], '--format=custom', '--no-owner', '--no-privileges',
                '--schema=public', '--schema=faintr_private', '--schema=auth', '--file='+str(archive)]
        for table in tables:
            if not re.fullmatch(r'[a-z_]+', table):
                raise RuntimeError('Unexpected auth table identifier.')
            args.append('--exclude-table-data=auth.'+table)
        run('pg_dump', args, env=env)
        toc = run('pg_restore', ['--list', str(archive)]).decode()
        for table in REQUIRED:
            schema, name = table.split('.')
            if not re.search(r'TABLE DATA '+schema+' '+name+r' ', toc):
                raise RuntimeError('Backup missing required table: '+table)
        run('gpg', ['--batch','--yes','--pinentry-mode','loopback','--passphrase-fd','0',
                    '--symmetric','--cipher-algo','AES256','--output',output,str(archive)],
            data=(os.environ['PASS']+'\n').encode())
    print('Encrypted backup created, including application schema and public short links.')

def restore(archive_path):
    if not os.environ.get('PASS'):
        raise RuntimeError('Backup passphrase is missing.')
    # Fixed loopback destination; production DB and PGPASSWORD cannot reach restore.
    target = 'postgresql://postgres@127.0.0.1:5432/faintr_restore'
    env = {'PATH': os.environ['PATH'], 'PGPASSWORD':'offline-restore-only', 'PGSSLMODE':'disable'}
    with tempfile.TemporaryDirectory(prefix='faintr-restore-') as tmp:
        archive = Path(tmp) / 'database.dump'
        run('gpg', ['--batch','--yes','--pinentry-mode','loopback','--passphrase-fd','0',
                    '--output',str(archive),'--decrypt',archive_path], data=(os.environ['PASS']+'\n').encode())
        fresh = run('psql',[target,'-XAt','-c',"select count(*) from pg_tables where schemaname in ('public','auth','faintr_private')"],env=env).strip()
        if fresh != b'0':
            raise RuntimeError('Restore destination is not empty; refusing to proceed.')
        run('psql',[target,'-X','-v','ON_ERROR_STOP=1'],env=env,data=b'''
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE ROLE supabase_auth_admin;
DROP SCHEMA public;
''')
        run('pg_restore',['--dbname='+target,'--no-owner','--no-privileges','--exit-on-error',
                          '--single-transaction',str(archive)],env=env)
        # Every COPY block is compared with the restored table. No row values,
        # counts or hashes are emitted into public logs or uploaded artifacts.
        sql = run('pg_restore',['--data-only','--no-owner','--no-privileges','--file=-',str(archive)])
        blocks = re.findall(rb'COPY ([^\n]+) FROM stdin;\n(.*?)\\\.\n', sql, flags=re.S)
        checked = set()
        def digest(data):
            return hashlib.sha256(b'\n'.join(sorted(data.splitlines()))).digest()
        for spec, expected in blocks:
            actual = run('psql',[target,'-XAt','-v','ON_ERROR_STOP=1','-c',
                'COPY '+spec.decode()+' TO STDOUT;'],env=env)
            if digest(expected) != digest(actual):
                raise RuntimeError('Restored data differs from the encrypted archive.')
            checked.add(spec.decode().split(' (')[0])
        if not REQUIRED.issubset(checked):
            raise RuntimeError('Restore verification did not cover every required table.')
        checks = run('psql',[target,'-XAt','-v','ON_ERROR_STOP=1','-c',"""
select (select relrowsecurity from pg_class where oid='public.user_storage'::regclass)
and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='get_shared_team')
and exists(select 1 from pg_constraint where contype='f' and conrelid='public.profiles'::regclass);
"""],env=env).strip()
        if checks != b't':
            raise RuntimeError('Restored privacy rules, relationships or sharing functions are missing.')
    print('Recovery passed: decryption, schema, constraints, RLS and exact table data verified in isolated Postgres.')

if __name__ == '__main__':
    try:
        mode, file = sys.argv[1:]
        {'backup':backup, 'restore':restore}[mode](file)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
