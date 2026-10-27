-- Rota-based availability and half/full-day sessions.
--
-- Dim tattoos around a shift job on a repeating rota, so availability is one
-- settings row (the pattern) plus per-date overrides he taps in from his phone.
-- availability_rules / availability_exceptions are left in place but unused.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Rota settings (exactly one row)
-- ---------------------------------------------------------------------------

create table if not exists public.rota_settings (
  id          smallint primary key default 1 check (id = 1),
  -- One letter per day from anchor_date: W = shift job, O = tattoo day.
  pattern     text not null check (pattern ~ '^[WO]{2,28}$'),
  anchor_date date not null,
  day_start   time not null default '10:00',
  day_end     time not null default '18:00',
  updated_at  timestamptz not null default now(),
  check (day_end > day_start)
);

-- 2-2-3 rota, confirmed with Dim: Wed 4 Nov 2026 is the first of two shift days.
insert into public.rota_settings (id, pattern, anchor_date)
values (1, 'WWOOOWWOOWWWOO', '2026-11-04')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Per-date overrides
-- ---------------------------------------------------------------------------

create table if not exists public.day_overrides (
  date        date primary key,
  open        boolean not null,
  -- Both set = custom hours (full day only); both null = default hours.
  start_time  time,
  end_time    time,
  note        text,
  created_at  timestamptz not null default now(),
  check ((start_time is null) = (end_time is null)),
  check (end_time is null or end_time > start_time)
);

alter table public.rota_settings enable row level security;
alter table public.day_overrides enable row level security;

drop policy if exists "public read rota" on public.rota_settings;
create policy "public read rota" on public.rota_settings for select using (true);

drop policy if exists "public read overrides" on public.day_overrides;
create policy "public read overrides" on public.day_overrides for select using (true);

-- ---------------------------------------------------------------------------
-- Bookings: session type + overlap guard
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column if not exists session_type text not null default 'half'
  check (session_type in ('half', 'full'));

-- A full day (10-18) and an afternoon (14-18) start at different times, so a
-- unique index on starts_at can no longer stop them colliding. An exclusion
-- constraint on the time range makes the database refuse any overlap, the
-- same guarantee the old index gave for identical slots.
drop index if exists public.bookings_one_confirmed_per_slot;

alter table public.bookings
  drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (status = 'confirmed');
