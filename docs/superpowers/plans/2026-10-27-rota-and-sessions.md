# Rota Availability + Half/Full-Day Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bookable days come from Dim's 14-day shift rota automatically; clients book a half day (£150) or full day (£250); Dim manages days from a phone-first calendar.

**Architecture:** Replace weekly rules with one rota settings row plus per-date overrides. The pure `buildAvailability` in `src/lib/availability.ts` stays the single source of truth (picker + server re-validation), now emitting session-typed slots. A Postgres exclusion constraint on the booking time range replaces the `starts_at` unique index, so a full day and a half day can never overlap.

**Tech Stack:** Next.js 16.3 App Router, Supabase Postgres (`btree_gist`), `@date-fns/tz`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-rota-and-sessions-design.md`

## Global Constraints

- Rota pattern from anchor **Wed 2026-11-04**: `WWOOOWWOOWWWOO` (14 days, W = shift job, O = tattoo day). Must reproduce: working 4–5, 9–10, 13–15 Nov; tattoo days 28–29 Oct, 6–8, 11–12, 16–17 Nov.
- Default tattoo-day window 10:00–18:00 → half days 10:00–14:00 and 14:00–18:00, full day 10:00–18:00.
- A date with custom hours (window ≠ default) offers **only a full day** for that window.
- Prices displayed only: Half day £150, Full day £250. Site charges nothing in this plan.
- Studio zone Europe/London; rota counts calendar dates, never instants (DST safe).
- Existing minimum notice (24h) and booking window (90 days) still apply.
- Next.js 16: check `node_modules/next/dist/docs/` before changing server actions or client/server boundaries.
- New migration `supabase/migrations/003_rota_sessions.sql`; applied via Supabase SQL editor on project `dsivhbmzpdjeqenzhglg`. Old `availability_rules`/`availability_exceptions` tables are left in place but unused.
- Admin UI must work at 375px with ≥44px touch targets.

## Review Focus

1. **Date across the anchor in the past** (e.g. 28 Oct, before 4 Nov) → still correct (negative modulo). Task 1 test.
2. **DST change day** (Sun 2026-10-25, Sun 2027-03-28) → rota day unchanged; 10:00 slot is 10:00 London. Task 1 test.
3. **Full day booked, client tries morning** (and reverse) → not offered; a crafted POST fails at the database (23P01). Task 1 test for offering; Task 3 manual SQL check.
4. **Dim closes a day that has a booking** → booking stays, admin warns. Task 4 manual check.
5. **Morning booked; Dim sets custom hours on that day** → full day would overlap the booking, so no slot offered that day (not an error). Task 1 test.

---

### Task 1: Rota engine (pure) + tests

**Files:**
- Modify: `package.json` (`vitest` dev dep, `"test": "vitest run"`)
- Modify: `src/lib/config.ts` (`site.sessions`)
- Modify: `src/lib/availability.ts`
- Test: `src/lib/availability.test.ts`

**Interfaces:**
- Produces (`config.ts`): `site.sessions = { half: { label: "Half day", price: "£150" }, full: { label: "Full day", price: "£250" } }`.
- Produces (`availability.ts`):
  - `type SessionType = "half" | "full"`
  - `type RotaSettings = { pattern: string; anchor_date: string; day_start: string; day_end: string }`
  - `type DayOverride = { date: string; open: boolean; start_time: string | null; end_time: string | null }`
  - `type Slot` gains `session: SessionType` (label becomes e.g. `"Morning · 10:00–14:00"`, `"Afternoon · 14:00–18:00"`, `"Full day · 10:00–18:00"`).
  - `isRotaWorkingDay(date: string, rota: RotaSettings): boolean`
  - `type DayPlan = { date: string; source: "rota" | "override"; open: boolean; window: { start: string; end: string } | null; halves: boolean }`
  - `planForDate(date: string, rota: RotaSettings, overrides: DayOverride[]): DayPlan` — override wins; open override without times → default window; custom times → `halves: false`.
  - `buildAvailability(input: { rota: RotaSettings; overrides: DayOverride[]; taken: TakenSlot[]; from: string; to: string; now?: Date }): DayAvailability[]` — replaces the rules/exceptions signature. Emits the full-day slot plus (when `halves`) both half slots, each dropped if it overlaps `taken` or starts inside minimum notice.
- Removes: `AvailabilityRule`, `AvailabilityException`, `blocksForDate`.

- [ ] **Step 1:** Branch `git checkout -b rota-sessions`; commit pending working-tree changes first as `Spell Dimitar's name correctly, size dropdown, studio portfolio photos`.
- [ ] **Step 2:** `npm i -D vitest`, add script.
- [ ] **Step 3: Write failing tests** (`ROTA = { pattern: "WWOOOWWOOWWWOO", anchor_date: "2026-11-04", day_start: "10:00", day_end: "18:00" }`, `now = new Date("2026-10-20T09:00:00Z")` unless stated):
  - `isRotaWorkingDay` true for 2026-11-04, 05, 09, 10, 13, 14, 15 and 2026-10-27; false for 2026-10-28, 29, 11-06, 07, 08, 11, 12, 16, 17.
  - `planForDate("2026-11-06")` → `{ open: true, window: {start:"10:00", end:"18:00"}, halves: true, source: "rota" }`; `planForDate("2026-11-04")` → `open: false`.
  - Override `{date:"2026-11-06", open:false}` → closed; `{date:"2026-11-04", open:true, start_time:null, end_time:null}` → open, halves true; `{date:"2026-11-06", open:true, start_time:"12:00", end_time:"18:00"}` → halves false, window 12–18.
  - `buildAvailability` for 2026-11-06 with nothing taken → 3 slots: full 10–18, morning 10–14, afternoon 14–18 (check `session` and ISO instants `2026-11-06T10:00:00.000Z` etc. — November is GMT).
  - Morning taken → only afternoon remains (full dropped). Full taken → no slots.
  - Custom 12–18 day with morning 10–14 taken → no slots; with nothing taken → one full slot 12:00–18:00.
  - DST: rota working state for 2026-10-25 equals pattern index computed by calendar days; a tattoo day in BST (pick 2027-03-29 if it's O, else nearest O after 28 Mar) has its 10:00 slot at `09:00:00.000Z`.
- [ ] **Step 4:** `npm test` → FAIL.
- [ ] **Step 5:** Implement. Day index = whole UTC-calendar-day difference between `date` and `anchor_date` (both `YYYY-MM-DD`), `((diff % 14) + 14) % 14`; working iff `pattern[i] === "W"`. Use `pattern.length`, not 14.
- [ ] **Step 6:** `npm test` passes.
- [ ] **Step 7:** Commit `Rota-based availability engine with half/full-day slots`.

---

### Task 2: Schema + data layer

**Files:**
- Create: `supabase/migrations/003_rota_sessions.sql`
- Modify: `src/lib/data.ts`

**Interfaces:**
- Produces (schema):
  - `public.rota_settings (id smallint primary key default 1 check (id = 1), pattern text not null, anchor_date date not null, day_start time not null default '10:00', day_end time not null default '18:00', updated_at timestamptz default now())`; seed `('WWOOOWWOOWWWOO','2026-11-04')`. RLS on; public select policy.
  - `public.day_overrides (date date primary key, open boolean not null, start_time time, end_time time, note text, created_at timestamptz default now(), check (start_time is null) = (end_time is null), check (end_time is null or end_time > start_time))`. RLS on; public select policy.
  - `bookings.session_type text not null default 'half' check (session_type in ('half','full'))`.
  - `create extension if not exists btree_gist;` drop index `bookings_one_confirmed_per_slot`; add `constraint bookings_no_overlap exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'confirmed')`.
- Produces (`data.ts`): `getRota(): Promise<RotaSettings | null>`, `getDayOverrides(from: string, to: string): Promise<DayOverride[]>`, `getAvailability()` rewired to the new `buildAvailability`; `Booking` gains `session_type: SessionType`; select lists include it. Remove `getAvailabilityRules` / `getAvailabilityExceptions`.

- [ ] **Step 1:** Write the migration.
- [ ] **Step 2:** Apply in Supabase SQL editor (Chrome) → "Success". Verify `select * from rota_settings;` returns the seed row.
- [ ] **Step 3:** Update `data.ts`. `npx tsc --noEmit` will now fail only in callers (booking action, admin page) — fixed in Tasks 3–4.
- [ ] **Step 4:** Commit `Rota settings, day overrides and overlap-proof bookings schema` (together with Task 3 if tsc must be green per commit).

---

### Task 3: Booking flow with session choice

**Files:**
- Modify: `src/components/booking-flow.tsx`
- Modify: `src/app/actions/booking.ts`
- Modify: `src/lib/email.ts` (session label + price in client confirmation and artist notification)
- Modify: `src/app/booking/[reference]/page.tsx` (show session row)

**Interfaces:**
- Consumes: `Slot.session`, `site.sessions`.
- Produces: form fields `startsAt`, `endsAt`, `session`. `createBooking` finds the slot by all three; inserts `session_type`; treats Postgres `23P01` exactly like `23505` (slot just taken).

- [ ] **Step 1:** Steps become `"session" | "date" | "time" | "details"`. Session step: two large cards "Half day · £150 · 4 hours" / "Full day · £250 · whole day". Date step offers only dates with ≥1 slot of that session. Half → time step showing only half slots (Morning/Afternoon labels). Full → skip time step, select that date's full slot.
- [ ] **Step 2:** Update `createBooking` and emails/booking page.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint`, `npm test` clean.
- [ ] **Step 4:** Manual (Chrome, `localhost:3005/book`): calendar shows 28–29 Oct (minus notice), 2–3 Nov, 6–8 Nov…, never 4–5 Nov. Book a test **full day** on 6 Nov → 6 Nov disappears for both session types. Book **morning** 7 Nov → 7 Nov still offers afternoon only, not full. In SQL editor, a manual insert of a full day 10–18 on 7 Nov fails with `conflicting key value violates exclusion constraint` (Review Focus 3). Delete the test rows afterwards.
- [ ] **Step 5:** Commit `Clients choose half or full day when booking`.

---

### Task 4: Phone-first admin calendar + rota settings

**Files:**
- Create: `src/components/admin-calendar.tsx` (client component)
- Modify: `src/app/admin/page.tsx` (replace "Weekly hours" and "Days off" sections)
- Modify: `src/app/actions/admin.ts` (remove `saveRule`, `deleteRule`, `closeDate`, `deleteException`; add below)

**Interfaces:**
- Consumes: `planForDate`, `getRota`, `getDayOverrides`, `listBookings`.
- Produces:
  - `setDay(formData: FormData): Promise<void>` — fields `date`, `open` (`"true"|"false"`), optional `startTime`, `endTime`. Upserts `day_overrides`. If the resulting plan equals the rota default for that date, delete the override instead (keeps the table minimal).
  - `resetDay(formData: FormData): Promise<void>` — field `date`; deletes override.
  - `saveRota(formData: FormData): Promise<void>` — fields `pattern` (only W/O, length 2–28), `anchorDate`, `dayStart`, `dayEnd`.
  - `<AdminCalendar days={DayTile[]} />` where `type DayTile = { date: string; plan: DayPlan; bookings: { reference: string; client_name: string; session_type: SessionType; starts_at: string; ends_at: string }[] }`, computed server-side for today → booking horizon.

- [ ] **Step 1:** Calendar: month-by-month grid (7 columns, tiles ≥44px), month heading, legend. Tile states by colour/fill: tattoo day, shift day (muted), closed by Dim (struck), opened by Dim, custom hours (small time label), booked markers (AM / PM / Full dot). Today outlined.
- [ ] **Step 2:** Tap tile → bottom sheet: date title; big Open/Closed toggle (submits `setDay` immediately); hours from/to (native `time` inputs, Save) with "Full day only" note when custom; "Reset to rota" when overridden; list of that day's bookings; if closing a day with bookings, show "These bookings stay — move or cancel them yourself" before the toggle commits (confirm step inside the sheet, no browser dialog).
- [ ] **Step 3:** Below the calendar, collapsed "Rota settings" disclosure: 14 W/O toggle chips seeded from the pattern, anchor date, default hours, Save.
- [ ] **Step 4:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] **Step 5:** Manual in Chrome at 375px wide (`/admin`, password from `.env.local`): close 6 Nov → disappears from `/book`; reopen via Reset; open 4 Nov (shift day) → appears with halves; set 11 Nov to 12–18 → `/book` offers only a full day 12–18 on 11 Nov; reset all three. Booking from Task 3 shows on its tile; closing that day shows the warning (Review Focus 4).
- [ ] **Step 6:** Commit `Phone-first admin calendar driven by the rota`.
