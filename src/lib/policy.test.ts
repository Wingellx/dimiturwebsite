import { expect, test } from "vitest";

import { checkoutTimes, clientCanChange, depositState, formatPence, refundAmount, holdExpiresAt, holdIsStale, paidOutcome, withinCutoff } from "./policy";

const start = "2026-11-10T10:00:00.000Z";
const at = (iso: string) => new Date(iso);

test("72h+ out: client can change", () => {
  expect(clientCanChange(start, at("2026-11-07T10:00:00.000Z"), false)).toBe(true); // exactly 72h
});

test("71h59m out: client cannot change", () => {
  expect(clientCanChange(start, at("2026-11-07T10:01:00.000Z"), false)).toBe(false);
});

test("refund lock blocks change even far out", () => {
  expect(clientCanChange(start, at("2026-10-01T10:00:00.000Z"), true)).toBe(false);
});

test("withinCutoff mirrors the boundary", () => {
  expect(withinCutoff(start, at("2026-11-07T10:00:00.000Z"))).toBe(false);
  expect(withinCutoff(start, at("2026-11-07T10:00:01.000Z"))).toBe(true);
});

test("hold lasts 30 minutes", () => {
  expect(holdExpiresAt(at("2026-11-01T12:00:00.000Z")).toISOString()).toBe("2026-11-01T12:30:00.000Z");
  expect(holdIsStale("2026-11-01T12:30:00.000Z", at("2026-11-01T12:29:59.000Z"))).toBe(false);
  expect(holdIsStale("2026-11-01T12:30:00.000Z", at("2026-11-01T12:30:00.000Z"))).toBe(true);
});

test("paidOutcome", () => {
  expect(paidOutcome("pending_payment")).toBe("confirm");
  expect(paidOutcome("expired")).toBe("try_reclaim");
  expect(paidOutcome("confirmed")).toBe("ignore"); // duplicate webhook
  expect(paidOutcome("cancelled")).toBe("ignore");
});

test("checkout expiry has margin over Stripe's 30-minute minimum, and the hold outlasts it", () => {
  const now = at("2026-11-01T12:00:00.000Z");
  const { stripeExpiresAt, holdUntil } = checkoutTimes(now);
  expect(stripeExpiresAt.getTime() - now.getTime()).toBeGreaterThanOrEqual(31 * 60 * 1000);
  expect(holdUntil.getTime()).toBeGreaterThanOrEqual(stripeExpiresAt.getTime());
});

test("a refunded late payment is never reprocessed", () => {
  expect(paidOutcome("expired", { refunded: true })).toBe("ignore");
  expect(paidOutcome("expired", { refunded: false })).toBe("try_reclaim");
});

test("depositState", () => {
  const base = { deposit_paid_at: null, refunded_at: null, status: "confirmed" as const };
  expect(depositState(base)).toBe("none");
  expect(depositState({ ...base, deposit_paid_at: "x" })).toBe("paid");
  expect(depositState({ ...base, deposit_paid_at: "x", refunded_at: "y" })).toBe("refunded");
  expect(depositState({ ...base, deposit_paid_at: "x", status: "cancelled" })).toBe("refund_needed");
});

test("client refunds keep Stripe's fee back; others are in full", () => {
  expect(refundAmount(5000, 95, "client")).toBe(4905);
  expect(refundAmount(5000, 95, "artist")).toBe(5000);
  expect(refundAmount(5000, 95, "late_payment")).toBe(5000);
  // A fee that can't be read falls back to the UK card estimate (1.5% + 20p).
  expect(refundAmount(5000, null, "client")).toBe(4905);
});

test("formatPence", () => {
  expect(formatPence(4905)).toBe("£49.05");
  expect(formatPence(95)).toBe("£0.95");
});

test("formatPriceLabel adds £ to bare numbers only", async () => {
  const { formatPriceLabel } = await import("./config");
  expect(formatPriceLabel("35")).toBe("£35");
  expect(formatPriceLabel("35.50")).toBe("£35.50");
  expect(formatPriceLabel("£80")).toBe("£80");
  expect(formatPriceLabel("80 cash")).toBe("80 cash");
  expect(formatPriceLabel(null)).toBe("");
});
