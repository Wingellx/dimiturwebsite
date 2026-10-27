# £50 booking deposits — design

Date: 2026-10-27
Site: Dimitar Penchev, tattooist, Lincoln (this repo)

## Why

Dim currently takes every booking through Instagram DMs. The site already does
instant-confirm booking, but a slot costs the client nothing to hold, so a
no-show costs Dim a half or full day of work. A £50 deposit, taken at booking
and credited against the final price, makes the booking real and makes a
no-show cost the client, not Dim.

Success: a client can go from the portfolio to a paid, confirmed slot without
messaging Dim, and Dim never has to chase, confirm, or refund anything by hand.

## Prices and money (context, not built)

- Half day £150, full day £250. The £50 deposit comes off that.
- The balance is paid in person on the day (bank transfer or cash). **The site
  does not take, track, or display the balance.** It only states "£50 deposit,
  taken off your final price."
- Payments go to **Dim's own Stripe account**, paid out to his bank. Ascendry
  never holds the money. Stripe UK card fee ≈ 1.5% + 20p (≈95p per deposit).

## Goals

1. Booking requires paying a £50 deposit by card, **Apple Pay** or Google Pay
   before the slot is confirmed.
2. Client can **cancel 72 hours or more before** the appointment and the £50 is
   refunded automatically to their card.
3. Under 72 hours, cancelling is **not possible**; the page says the deposit is
   kept if they don't attend.
4. Client can **move** the appointment themselves to any open slot, **only 72
   hours or more before** it, and must type a **reason**. The deposit carries
   over; they don't pay again. Under 72 hours they must contact Dim directly to
   ask, and Dim moves it from `/admin` if he agrees.
5. Dim sees, in `/admin`, each booking's deposit status, any refund, and every
   move with its reason.

## Non-goals

- Taking or tracking the balance.
- Different deposit amounts per session length (it is £50 flat).
- Half-day vs full-day selection by the client (slot length stays as admin
  configures it today).
- Bank-transfer deposits.
- Email delivery setup (Resend + domain) — separate task; see Constraints.

## Anti-goals (would be a failure even if it "works")

- A slot shown as confirmed, or blocked from others, when no deposit was paid.
- Two clients both holding the same slot.
- Dim having to log into Stripe to issue routine refunds.
- Clients' card details touching this site's server (they must only ever be
  entered on Stripe's hosted page).

## How it works

### Paying (decided)

- Use **Stripe Checkout (hosted page)**, not embedded card fields. Checkout
  shows Apple Pay / Google Pay automatically on supporting devices with no
  domain verification needed, and keeps card data off our server.
- Flow: client picks slot → fills details + reference images (as today) →
  submits → booking row inserted as `pending_payment` (this insert is still the
  slot lock) → redirect to Stripe Checkout for £50 GBP →
  on success Stripe redirects back to `/booking/[ref]?t=[token]`.
- **Confirmation happens on the Stripe webhook** (`checkout.session.completed`),
  not on the redirect, because the redirect can be skipped (tab closed). The
  booking page must handle "payment received, still confirming" for the few
  seconds before the webhook lands.
- Confirmation + artist-notification emails are sent on the webhook, not at
  submit.
- **Policy agreement:** the client must tick agreement to the deposit terms
  on the booking form before payment (stored as `terms_accepted_at`), and
  Checkout repeats the terms as custom text. (Stripe's own
  `consent_collection` needs a public terms URL on the account, so it can be
  added once the site has a real domain.) The terms:
  £50 credited to the final price; refunded only if cancelled 72+ hours
  before; non-refundable for no-shows or later cancellation; changes under 72
  hours by contacting Dim. Same terms shown on the booking form before
  payment and on a short policy section of the site (Stripe's account review
  and dispute evidence both need it public). This is Dim's main defence
  against no-show chargebacks.
- Stripe account settings (Dim's): Radar fraud protection on; Stripe Tax and
  Invoicing off.

### Holding the slot while paying (builder's call on mechanism; my call on rule)

- **My call:** a `pending_payment` booking holds its slot for **30 minutes**
  (Stripe Checkout's minimum session expiry). If unpaid by then it becomes
  `expired` and the slot reopens. Nothing is emailed for an expired booking.
- Release on `checkout.session.expired` webhook, **and** treat any
  `pending_payment` older than 30 minutes as free in availability and at insert
  time, so a missed webhook can't block a slot forever.
- The double-booking unique index must cover `pending_payment` as well as
  `confirmed`.
- **Late payment (my call):** if `checkout.session.completed` arrives for a
  booking already released as `expired`, confirm it only if the slot is still
  free. If someone else now holds the slot, refund the £50 automatically
  through the Refunds API and email the client that the slot went and they've
  been refunded. Never put two clients in one slot; never leave Dim a manual
  refund.

### Cancelling

- Allowed only if `now <= starts_at − 72 hours` (72 hours exact, not calendar
  days — **my call**).
- On cancel: refund the £50 through the Stripe Refunds API, status
  `cancelled`, store the refund id, email client + Dim. Stripe keeps its ~95p
  fee; Dim absorbs it.
- Under 72 hours: no cancel or move buttons. Copy along the lines of "It's
  too close to your appointment to cancel or change it online. If you need to
  move it, message Dim directly. If you don't attend, the £50 deposit isn't
  refunded." Link Dim's Instagram/phone from `site.contact`.
- **Artist cancels from `/admin`** (exists today): always a full refund
  — **my call**; it's Dim's choice, not the client's fault.

### Moving (rescheduling)

- **Client self-serve:** from the client's booking page (same `?t=` token as
  cancel), only while `now <= starts_at − 72 hours` (Jacob's rule).
- Client picks a new slot using the same date/time picker (same availability
  rules: minimum notice, booking window), and must enter a non-empty reason.
- **Dim from `/admin`:** can move any confirmed booking at any time (this is
  how under-72-hour requests get handled). Reason field optional for Dim.
- **Refund lock (my call):** if Dim moves a booking while it is inside the
  72-hour window, the deposit becomes non-refundable for good, even if the new
  date is more than 72 hours away — otherwise "move it, then cancel" refunds a
  late cancellation. Stored as a flag on the booking; the client page then
  hides cancel and says the deposit is non-refundable. Dim can still refund
  manually by cancelling from `/admin` (artist cancel always refunds).
- The move is atomic: the booking's `starts_at`/`ends_at` change in one update,
  protected by the same unique index, so the new slot can't be double-booked.
- Each move is recorded (old time, new time, reason, when) — a history table,
  not overwritten fields.
- Email client + Dim with old time, new time and reason.
- **Unlimited self-serve moves (72h+ out) — my call, open for Jacob to cap.**

### Admin

- Booking list shows: deposit paid / refunded, and moves with reasons.
- Pending and expired bookings are hidden from the main list (they aren't real
  appointments).

## Constraints

- Next.js 16 App Router, Supabase (Dim's own project `dsivhbmzpdjeqenzhglg`,
  eu-west-1), server actions on the service role — follow existing patterns in
  `src/app/actions/booking.ts`.
- New env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (and a deposit
  amount constant in `src/lib/config.ts`, £50 / 5000 pence, GBP).
- Build and test in **Stripe test mode** first; go live by swapping keys.
- Schema changes go in a new migration (`003_deposits.sql`), not edits to
  001/002, since 001/002 are already applied to Dim's project. That project
  was created 2026-10-27 and has **no real bookings**, so there are no
  deposit-less bookings to migrate or special-case.
- Emails are silent without Resend configured. Until it is, the cancel/move
  link only reaches the client via the post-payment redirect page — acceptable
  for building and testing, must be fixed before go-live.
- Apple Pay on the live site needs HTTPS (Vercel) — works in Checkout once
  deployed; won't show on `localhost`.

## Left to the builder

- Exact table/column names, status names, and how move history is stored.
- Webhook route location and Stripe SDK usage.
- Whether "still confirming" polls or just asks the client to refresh.
- Admin layout for the new fields.
