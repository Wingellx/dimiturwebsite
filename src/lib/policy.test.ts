import { expect, test } from "vitest";

import { clientCanChange, holdExpiresAt, holdIsStale, paidOutcome, withinCutoff } from "./policy";

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
