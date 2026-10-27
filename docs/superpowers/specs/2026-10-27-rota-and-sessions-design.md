# Rota-based availability + half/full-day sessions — design

Date: 2026-10-27
Site: Dimitar Penchev, tattooist, Lincoln (this repo)
Related: `2026-10-27-deposits-design.md` (built after this; see Order)

## Why

Dim tattoos around a shift job on a rotating rota, so "Tue–Sat every week"
(the current weekly-hours model) never matches reality. Maintaining it means
deleting and re-adding hour rows through small forms, mostly on his phone.
He also sells two products — half day £150, full day £250 — but the site
only offers one fixed slot length per day, and clients can't choose.

Success: Dim sets his rota once and never touches hours again except to tap a
day closed/open or tweak one day's hours, comfortably on a phone. Clients
choose half or full day and only see what's genuinely free.

## The rota (Jacob, confirmed with Dim)

- 14-day **2-2-3** cycle of his shift job. Read from the anchor:
  **2 working → 3 off → 2 working → 2 off → 3 working → 2 off**, then repeat.
  (The check dates below are what Jacob confirmed with Dim; they win over any
  other wording of the pattern.)
- Anchor: **Wed 4 Nov 2026 is day 1 of that sequence (first of 2 working).**
  Check dates: working 4–5 Nov, 9–10 Nov, 13–15 Nov; off (tattoo days)
  6–8 Nov, 11–12 Nov, 28–29 Oct. (27 Oct was a working day; he was off sick.)
- **Off days are tattoo days, 10:00–18:00.** Working days have no bookings.
- The pattern is data (a list of on/off block lengths + anchor date +
  default hours), not hard-coded, so a new rota is a settings change.

## Sessions (Jacob, confirmed)

- A tattoo day holds **either two half days or one full day.**
- Default day 10:00–18:00 → half days **10:00–14:00** and **14:00–18:00**;
  full day **10:00–18:00**.
- A full day blocks both halves; either half being booked blocks the full day.
- Client chooses Half day (£150) or Full day (£250) when booking. Price is
  shown for information only; the site takes the £50 deposit (other spec)
  and nothing else. Store the choice on the booking.
- **Jacob's rule:** when Dim changes one day's hours (e.g. 12:00–18:00), that
  day offers **only a full day** (the whole window), no half days.
- All bookings go through the site from now on (no Instagram/DM bookings), so
  there is no "mark taken" admin action.

## Goals

1. Bookable days come from the rota automatically, for the whole booking
   window (90 days), with no weekly upkeep.
2. Per-day overrides: Dim can close an off day, open a working day, or set
   different hours for one date.
3. Phone-first admin calendar replacing the current "Weekly hours" and "Days
   off" sections.
4. Half/full-day choice in the booking flow, with correct blocking between
   them.

## Non-goals

- Multiple rotas, recurring exceptions ("every Christmas"), or hours that vary
  by weekday within the rota.
- Session lengths other than half/full.
- Charging the balance.

## Anti-goals

- A full day and a half day both booked on the same date.
- Closing a day silently cancelling or hiding an existing booking.
- Any admin action that's awkward one-handed on a phone (tiny controls,
  multi-field forms for a simple open/close).

## Admin UI (phone-first)

- **Calendar:** scrolling list or month grid of the next ~90 days, large
  tappable day tiles. Each tile shows its state at a glance: tattoo day
  (open), working day (closed by rota), closed by Dim, opened by Dim, custom
  hours, and booked (half AM / half PM / full).
- **Tap a day → panel:** Open/Closed toggle; that day's hours (from/to) with a
  "reset to rota" option. Saves immediately; no separate submit form.
- If the day has bookings, the panel lists them. Closing it is allowed but
  shows a warning that existing bookings stay and Dim must move/cancel them
  himself — **my call**.
- **Rota settings** (rarely used, tucked below the calendar): pattern, anchor
  date, default hours. Pre-filled with the rota above.
- Must work well at 375px wide with touch targets ≥44px.

## Booking flow (client)

- Step order becomes: session type (Half day £150 / Full day £250) → date →
  time (only for half days: Morning 10–14 / Afternoon 14–18, using the day's
  actual window) → details.
- Dates offered are those with at least one bookable option of the chosen
  type.

## Constraints

- Next.js 16 App Router, Supabase (Dim's project `dsivhbmzpdjeqenzhglg`),
  existing patterns in `src/lib/availability.ts` (pure `buildAvailability`,
  re-validated server-side in the booking action) and `src/app/actions/`.
- **Double-booking guard must change:** the current unique index on
  `starts_at` can't stop a full day (10:00) overlapping an afternoon half
  (14:00). Use a database overlap constraint (e.g. `btree_gist` exclusion on
  the booking's time range for active statuses) so the database, not app
  code, still guarantees no overlaps. This must stay compatible with the
  deposits work, which adds a `pending_payment` status that also holds a
  slot.
- New migration file; 001/002 are applied. `availability_rules` /
  `availability_exceptions` may be replaced or repurposed — builder's call —
  but Dim's project has no real data in them (seed rows only).
- Studio timezone Europe/London; the rota counts calendar dates in that zone
  (DST must not shift a day).

## Order relative to deposits

Build this **first**, then the deposits plan, because both change the booking
flow and the slot-lock index; the deposits plan will be updated to use the
overlap constraint and the session type.

## Left to the builder

- Table shape for rota settings and per-date overrides.
- Calendar layout (list vs month grid) as long as it meets the phone
  constraints.
- How the session-type choice is represented in the URL/form state.
