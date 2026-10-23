-- PROPOSAL ONLY. Apply with analytics approval, after enabling Supabase Cron
-- through its documented integration if it is not already enabled.
-- Deletes only expired optional analytics; never account, roster or team records.
-- Inspect an existing job of this exact name before running: cron.schedule updates
-- a same-named job. Confirm the name is reserved for this purpose.
select cron.schedule('faintr-usage-retention','17 * * * *',$job$
 delete from faintr_usage.events where received_at<now()-interval '30 days';
 delete from faintr_usage.limits where minute<now()-interval '10 minutes';
 delete from cron.job_run_details where jobid=(select jobid from cron.job where jobname='faintr-usage-retention') and end_time<now()-interval '7 days';
$job$);
