-- £50 deposits through Stripe Checkout.
--
-- A booking now starts as 'pending_payment', holding its slot for 30 minutes
-- while the client is on Stripe's page. Only the Stripe webhook confirms it.

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending_payment', 'confirmed', 'cancelled', 'completed', 'expired'));
-- The default stays 'confirmed' on purpose: the booking action always sets
-- 'pending_payment' explicitly, and a code version that predates deposits can
-- keep inserting safely while the two are deployed out of step.

alter table public.bookings
  add column if not exists pending_expires_at        timestamptz,
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists stripe_payment_intent_id  text,
  add column if not exists deposit_paid_at           timestamptz,
  add column if not exists stripe_refund_id          text,
  add column if not exists refunded_at               timestamptz,
  add column if not exists refund_locked             boolean not null default false,
  add column if not exists terms_accepted_at         timestamptz;

-- A payment hold blocks the slot exactly like a confirmed booking. Stale holds
-- are cleared by release_stale_holds() right before any insert or move, since
-- a constraint's WHERE clause cannot look at the clock.
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('confirmed', 'pending_payment'));

create or replace view public.taken_slots
with (security_invoker = off) as
  select starts_at, ends_at
  from public.bookings
  where status = 'confirmed'
     or (status = 'pending_payment' and pending_expires_at > now());

grant select on public.taken_slots to anon, authenticated;

-- Expires unpaid holds whose 30 minutes are up and that overlap the range.
create or replace function public.release_stale_holds(range_start timestamptz, range_end timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings
     set status = 'expired'
   where status = 'pending_payment'
     and pending_expires_at <= now()
     and tstzrange(starts_at, ends_at, '[)') && tstzrange(range_start, range_end, '[)');
$$;

revoke all on function public.release_stale_holds(timestamptz, timestamptz) from public, anon, authenticated;

-- Every move, client or artist, with its reason.
create table if not exists public.booking_moves (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  old_starts_at  timestamptz not null,
  old_ends_at    timestamptz not null,
  new_starts_at  timestamptz not null,
  new_ends_at    timestamptz not null,
  reason         text,
  moved_by       text not null check (moved_by in ('client', 'artist')),
  created_at     timestamptz not null default now()
);

create index if not exists booking_moves_booking_id_idx on public.booking_moves (booking_id);
alter table public.booking_moves enable row level security;
