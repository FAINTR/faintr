-- Allow fast + three charged moves for Mega forms; retain all privacy/rate rules.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.create_shared_team(jsonb,text,text)'::regprocedure);
  if position('not between 2 and 4' in definition) > 0 then return; end if;
  if position('not between 2 and 3' in definition) = 0 then
    raise exception 'Unexpected sharing function validation; manual review required';
  end if;
  execute replace(definition, 'not between 2 and 3', 'not between 2 and 4');
end;
$$;
