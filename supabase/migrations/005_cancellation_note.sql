-- A message from Dim when he cancels, shown to the client in the email and on
-- their booking page.
alter table public.bookings add column if not exists cancellation_note text;
