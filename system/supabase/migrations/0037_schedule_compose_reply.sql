-- Five minutes, not two. Nothing is waiting on this the way a booking alert is
-- waiting: the reply is a draft for Otis to read when he gets to it, and the
-- alert has already told him the booking exists.
select cron.schedule('saved-list-reply', '*/5 * * * *', 'select public.invoke_edge(''compose-reply'')');
