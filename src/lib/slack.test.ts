import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { newBookingAlert, cancellationAlert } = await import("./slack");

test("new booking alert carries the essentials and escapes client text", () => {
  const text = newBookingAlert({
    clientName: "Sam <script>",
    clientPhone: "07700 900000",
    startsAt: "2026-11-06T10:00:00.000Z",
    endsAt: "2026-11-06T14:00:00.000Z",
    session: "half",
    placement: "Forearm",
    sizeEstimate: "Quarter sleeve",
    notes: "Rose & dagger",
    imageCount: 2,
  });
  expect(text).toContain("New booking");
  expect(text).toContain("Sam &lt;script&gt;");
  expect(text).toContain("Half day (£150)");
  expect(text).toContain("Forearm · Quarter sleeve");
  expect(text).toContain("Rose &amp; dagger");
  expect(text).toContain("2 reference images");
});

test("cancellation alert flags a failed refund", () => {
  const text = cancellationAlert({
    clientName: "Sam",
    startsAt: "2026-11-06T10:00:00.000Z",
    endsAt: "2026-11-06T14:00:00.000Z",
    cancelledBy: "client",
    refund: "failed",
  });
  expect(text).toContain("Refund failed");
});
