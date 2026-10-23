-- Operator-only aggregate queries. Do not grant browser access to the private schema.
-- Window: previous 30 days. Counts include only consented successfully received events.
select count(distinct visitor) as consented_unique_browsers,
 count(distinct session) as sessions,
 count(*) filter(where event='page_view') as tool_page_views,
 count(distinct visitor) filter(where returning) as returning_browsers
from faintr_usage.events where received_at>now()-interval '30 days';

with sessions as (
 select session,source,bool_or(event='builder_started') as started,
 bool_or(event='builder_completed') as completed,
 bool_or(event in ('grade_completed','simulation_completed','iv_completed','roster_saved','roster_imported','team_saved')) as engaged
 from faintr_usage.events where received_at>now()-interval '30 days' group by session,source
)
select source,count(*) as sessions,count(*) filter(where engaged) as engaged_sessions,
 count(*) filter(where started) as builder_starts,count(*) filter(where started and completed) as completed_started_sessions
from sessions group by source order by sessions desc;

select tool,event,count(*) as actions,count(distinct session) as sessions
from faintr_usage.events where received_at>now()-interval '30 days' group by tool,event order by actions desc;

-- Retention maintenance when collection has stopped (operator only):
-- delete from faintr_usage.events where received_at<now()-interval '30 days';
