-- Custom bookings Dim adds by hand (e.g. a one-hour piece), with an optional
-- price shown to the client.
alter table public.bookings drop constraint if exists bookings_session_type_check;
alter table public.bookings
  add constraint bookings_session_type_check
  check (session_type in ('half', 'full', 'custom'));
alter table public.bookings add column if not exists price_label text;
