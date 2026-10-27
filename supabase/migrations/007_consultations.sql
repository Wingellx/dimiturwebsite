-- Optional 30-minute design consultation a client can add after booking,
-- paid on the tattoo day. Either at the start of the tattoo session, or on a
-- separate day they request and Dim approves. An approved separate-day
-- consultation becomes its own 30-minute 'consultation' booking row so the
-- overlap guard keeps that time free.
alter table public.bookings drop constraint if exists bookings_session_type_check;
alter table public.bookings
  add constraint bookings_session_type_check
  check (session_type in ('half', 'full', 'custom', 'consultation'));

alter table public.bookings
  add column if not exists consultation_option text
    check (consultation_option in ('same_day', 'separate')),
  add column if not exists consultation_status text
    check (consultation_status in ('confirmed', 'requested', 'approved')),
  add column if not exists consultation_requested_start timestamptz,
  add column if not exists consultation_block_id uuid references public.bookings(id) on delete set null;
