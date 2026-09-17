-- Every two minutes, matching the runner. A booking alert that arrives two
-- minutes late is indistinguishable from an instant one to the person reading
-- it; a booking that never arrives at all is what this replaces.
select cron.schedule('owner-booking-alert', '*/2 * * * *', 'select public.invoke_edge(''notify-owner'')');
