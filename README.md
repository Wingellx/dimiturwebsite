# Dimitar Penchev — tattoo site

Portfolio and instant-confirm booking. Next.js 16 (App Router) · Supabase · Tailwind 4.

Standalone project with its own git repository — nothing here is shared with any other codebase.

---

## What it does

**For clients**
- Portfolio with a tap-to-enlarge lightbox
- Pick a date → pick a time → add details. The slot is **confirmed immediately**, not requested.
- Attach up to 6 reference images plus free-text notes (style, placement, cover-up, allergies)
- Confirmation email with a reference code and a link to cancel

**For Dimitar** — `/admin`, one password
- Every upcoming appointment with the client's contact details, notes and reference images
- Cancel an appointment (the client is emailed automatically) or mark it done
- Set weekly working hours and session length
- Block individual dates for holidays

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Create the Supabase project

At [supabase.com](https://supabase.com) — the free tier is comfortably enough.

Run both migrations in the SQL editor, in order:

1. `supabase/migrations/001_init.sql` — tables, RLS, and the double-booking guard
2. `supabase/migrations/002_storage.sql` — the `references` and `portfolio` buckets

Then fill in from **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The service role key bypasses row-level security. It is server-side only — never expose it to the browser or commit it.

### 3. Admin password

```
ADMIN_PASSWORD=whatever-dimitar-will-remember
ADMIN_SESSION_SECRET=  # openssl rand -base64 48
```

### 4. Email (optional, but bookings are silent without it)

Sign up at [resend.com](https://resend.com), verify a sending domain, then:

```
RESEND_API_KEY=
BOOKING_EMAIL_FROM=hello@yourdomain.com
ARTIST_NOTIFICATION_EMAIL=dimitar@wherever.com
```

Without these, bookings still save correctly — nobody just gets emailed about them.

### 5. Run

```bash
npm run dev
```

---

## Adding portfolio photos

Drop image files into `public/portfolio/`. They appear on the site automatically, in filename order.

```
public/portfolio/
  01-fine-line-snake-forearm.jpg
  02-blackwork-sleeve.jpg
```

Two things the filename controls:

- **Order** — the numeric prefix. `01-` shows first.
- **Alt text** — the rest of the name becomes the description read by screen readers and Google. `01-fine-line-snake-forearm.jpg` reads as *"Fine line snake forearm — tattoo by Dimitar Penchev"*. Worth naming them properly; it is free SEO.

Resize anything enormous before adding it — these ship to every visitor. 2000px on the long edge is plenty.

For a portfolio Dimitar can update himself later, the `portfolio_items` table and the public `portfolio` storage bucket already exist and take priority over this folder when populated.

---

## Details worth knowing

**Double-booking is prevented by the database, not by application code.** `bookings_one_confirmed_per_slot` is a partial unique index on `starts_at`. If two people submit the same slot simultaneously, one insert succeeds and the other returns `23505`, which the booking action turns into "someone booked that a moment before you". Checking availability and then inserting would leave a window where both requests believe the slot is free.

**The submitted slot is re-validated server-side.** The action rebuilds availability and only accepts a time the picker would genuinely have offered — so a hand-crafted request cannot book 3am on a Sunday or skip the minimum-notice window.

**Times are studio-local, always.** `site.timezone` in `src/lib/config.ts` defines the studio's zone (currently `Europe/London`). Slots are built through `TZDate` rather than raw `Date` arithmetic, so the two days a year the clocks change do not silently shift every appointment by an hour.

**Reference images are downscaled in the browser** to 1600px before upload (`src/lib/image-resize.ts`). This is not just an optimisation — Vercel caps a request body at ~4.5MB, and six untouched phone photos would exceed that and fail on deploy. It also means uploads finish quickly on mobile data.

**Reference images are private.** They sit in a non-public bucket and the admin page reads them through one-hour signed URLs. A client's idea for their own body should not live on a guessable public URL.

**Admin auth is one shared password, deliberately.** There is exactly one user and he is not technical; accounts, resets and verification screens would all be things to go wrong. The password never becomes the cookie — the cookie holds an HMAC-signed expiry and dies after 14 days.

---

## Configuration

Most of what Dimitar might want changed lives in `src/lib/config.ts`:

| Setting | What it does |
|---|---|
| `artist`, `tagline` | Name and strapline across the site |
| `studio`, `contact` | Footer address and contact links — blank blocks are hidden, not shown empty |
| `timezone` | The studio's IANA zone. Every displayed time is local to this |
| `bookingWindowDays` | How far ahead clients can book (default 90) |
| `minimumNoticeHours` | Minimum notice (default 24) |
| `uploads` | File count and size limits |

Working hours and days off are **not** in here — they are managed in `/admin` so Dimitar can change them without a deploy.

---

## Deploying

Vercel is the path of least resistance:

1. Push to a new GitHub repo
2. Import it at [vercel.com/new](https://vercel.com/new)
3. Add every variable from `.env.example` to the project's environment variables
4. Set `NEXT_PUBLIC_SITE_URL` to the real domain — email links break without it

Then point the domain at Vercel and add it in Resend so confirmation emails send from it.

---

## Before it goes live

- [ ] Fill in `studio` and `contact` in `src/lib/config.ts` — the footer is bare until you do
- [ ] Confirm the timezone is right
- [ ] Add real photos to `public/portfolio/`
- [ ] Set the real working hours in `/admin` (the seeded Tue–Sat is a placeholder)
- [ ] Book a test appointment end to end and confirm both emails arrive
- [ ] Cancel that test booking and check the slot reopens
