-- Dimitar Penchev — tattoo booking schema.
-- Instant-confirm booking: a client picks a free slot and it is locked on submit.
-- Everything is written through server actions using the service role, so the
-- anon key never gets write access (see the RLS policies at the bottom).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------

-- The normal working week. One row per block of time on a given weekday; a day
-- with two rows (e.g. 10:00-13:00 and 14:00-18:00) gets a lunch gap for free.
create table if not exists public.availability_rules (
  id            uuid primary key default gen_random_uuid(),
  -- 0 = Sunday .. 6 = Saturday, matching JS getDay().
  day_of_week   smallint not null check (day_of_week between 0 and 6),
  start_time    time not null,
  end_time      time not null,
  -- How long one appointment slot runs. Tattoo sessions are long, so this is
  -- deliberately coarse (default 3h) rather than the 30min a barber would use.
  slot_minutes  integer not null default 180 check (slot_minutes between 30 and 720),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  check (end_time > start_time)
);

-- One-off overrides. 'closed' blocks a date that the weekly rules would have
-- opened (holiday, convention); 'open' adds a date the rules would have closed.
create table if not exists public.availability_exceptions (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  kind          text not null check (kind in ('closed', 'open')),
  -- Only used when kind = 'open'.
  start_time    time,
  end_time      time,
  slot_minutes  integer default 180,
  note          text,
  created_at    timestamptz not null default now(),
  unique (date, kind),
  check (kind = 'closed' or (start_time is not null and end_time is not null and end_time > start_time))
);

create index if not exists availability_exceptions_date_idx
  on public.availability_exceptions (date);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  -- Short human-readable code the client gets in their email, used as the
  -- public URL for viewing/cancelling. The cancel action also requires
  -- cancel_token, so knowing the reference alone is not enough to cancel.
  reference      text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  cancel_token   uuid not null default gen_random_uuid(),

  client_name    text not null,
  client_email   text not null,
  client_phone   text,

  starts_at      timestamptz not null,
  ends_at        timestamptz not null,

  -- What they want done.
  placement      text,
  size_estimate  text,
  notes          text,

  status         text not null default 'confirmed'
                 check (status in ('confirmed', 'cancelled', 'completed')),
  cancelled_at   timestamptz,
  cancelled_by   text check (cancelled_by in ('client', 'artist')),

  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- THE double-booking guard. A partial unique index means two people racing for
-- the same slot cannot both win: the second insert fails at the database, not
-- in application code where a check-then-insert would leave a race window.
create unique index if not exists bookings_one_confirmed_per_slot
  on public.bookings (starts_at)
  where status = 'confirmed';

create index if not exists bookings_starts_at_idx on public.bookings (starts_at);
create index if not exists bookings_status_idx on public.bookings (status);

-- Reference images the client uploads with the booking.
create table if not exists public.booking_images (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

create index if not exists booking_images_booking_id_idx
  on public.booking_images (booking_id);

-- ---------------------------------------------------------------------------
-- Portfolio
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_items (
  id           uuid primary key default gen_random_uuid(),
  storage_path text,
  -- Lets the site run off files committed to /public before Supabase Storage
  -- has anything in it.
  static_src   text,
  alt          text not null default '',
  sort_order   integer not null default 0,
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  check (storage_path is not null or static_src is not null)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Nothing is writable with the anon key. Reads are allowed only where a public
-- page genuinely needs them; booking rows are never publicly readable, because
-- the slot picker only needs to know a time is taken, which it gets from the
-- taken_slots view rather than from the bookings themselves.

alter table public.availability_rules      enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings                enable row level security;
alter table public.booking_images          enable row level security;
alter table public.portfolio_items         enable row level security;

drop policy if exists "public read rules" on public.availability_rules;
create policy "public read rules" on public.availability_rules
  for select using (active = true);

drop policy if exists "public read exceptions" on public.availability_exceptions;
create policy "public read exceptions" on public.availability_exceptions
  for select using (true);

drop policy if exists "public read portfolio" on public.portfolio_items;
create policy "public read portfolio" on public.portfolio_items
  for select using (published = true);

-- Deliberately no select/insert/update policy on bookings or booking_images:
-- every read and write goes through a server action on the service role.

-- ---------------------------------------------------------------------------
-- Booked-slot lookup
-- ---------------------------------------------------------------------------
-- Exposes only the start/end of taken slots, with no client details attached,
-- so the calendar can grey them out without leaking who booked what.

create or replace view public.taken_slots
with (security_invoker = off) as
  select starts_at, ends_at
  from public.bookings
  where status = 'confirmed';

grant select on public.taken_slots to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed: a sensible default week. Dimitar changes these in /admin once set up.
-- ---------------------------------------------------------------------------

insert into public.availability_rules (day_of_week, start_time, end_time, slot_minutes)
select * from (values
  (2, time '10:00', time '18:00', 240),  -- Tue
  (3, time '10:00', time '18:00', 240),  -- Wed
  (4, time '10:00', time '18:00', 240),  -- Thu
  (5, time '10:00', time '18:00', 240),  -- Fri
  (6, time '11:00', time '17:00', 180)   -- Sat
) as v(day_of_week, start_time, end_time, slot_minutes)
where not exists (select 1 from public.availability_rules);
