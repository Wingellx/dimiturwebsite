import { describe, expect, test } from "vitest";

import {
  buildAvailability,
  isRotaWorkingDay,
  partOfDay,
  planForDate,
  type DayOverride,
  type RotaSettings,
} from "./availability";

const ROTA: RotaSettings = {
  pattern: "WWOOOWWOOWWWOO",
  anchor_date: "2026-11-04",
  day_start: "10:00",
  day_end: "18:00",
};
const NOW = new Date("2026-10-20T09:00:00Z");

function day(date: string, overrides: DayOverride[] = [], taken: { starts_at: string; ends_at: string }[] = []) {
  return buildAvailability({ rota: ROTA, overrides, taken, from: date, to: date, now: NOW })[0].slots;
}

describe("isRotaWorkingDay", () => {
  test.each(["2026-11-04", "2026-11-05", "2026-11-09", "2026-11-10", "2026-11-13", "2026-11-14", "2026-11-15", "2026-10-27"])(
    "%s is a shift day",
    (date) => expect(isRotaWorkingDay(date, ROTA)).toBe(true),
  );
  test.each(["2026-10-28", "2026-10-29", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-11", "2026-11-12", "2026-11-16", "2026-11-17"])(
    "%s is a tattoo day",
    (date) => expect(isRotaWorkingDay(date, ROTA)).toBe(false),
  );
  test("DST change days follow the calendar, not the clock", () => {
    expect(isRotaWorkingDay("2026-10-25", ROTA)).toBe(false);
    expect(isRotaWorkingDay("2027-03-28", ROTA)).toBe(false);
    expect(isRotaWorkingDay("2027-03-29", ROTA)).toBe(true);
  });
});

describe("planForDate", () => {
  test("tattoo day from the rota", () => {
    expect(planForDate("2026-11-06", ROTA, [])).toEqual({
      date: "2026-11-06",
      source: "rota",
      open: true,
      window: { start: "10:00", end: "18:00" },
      halves: true,
    });
  });
  test("shift day from the rota is closed", () => {
    expect(planForDate("2026-11-04", ROTA, []).open).toBe(false);
  });
  test("override closes a tattoo day", () => {
    const plan = planForDate("2026-11-06", ROTA, [{ date: "2026-11-06", open: false, start_time: null, end_time: null }]);
    expect(plan.open).toBe(false);
    expect(plan.source).toBe("override");
  });
  test("override opens a shift day with default hours and halves", () => {
    const plan = planForDate("2026-11-04", ROTA, [{ date: "2026-11-04", open: true, start_time: null, end_time: null }]);
    expect(plan).toMatchObject({ open: true, halves: true, window: { start: "10:00", end: "18:00" } });
  });
  test("custom hours mean full day only", () => {
    const plan = planForDate("2026-11-06", ROTA, [{ date: "2026-11-06", open: true, start_time: "12:00", end_time: "18:00" }]);
    expect(plan).toMatchObject({ open: true, halves: false, window: { start: "12:00", end: "18:00" } });
  });
  test("database times with seconds are accepted", () => {
    const plan = planForDate("2026-11-06", { ...ROTA, day_start: "10:00:00", day_end: "18:00:00" }, []);
    expect(plan.window).toEqual({ start: "10:00", end: "18:00" });
    expect(plan.halves).toBe(true);
  });
});

describe("buildAvailability", () => {
  test("a free tattoo day offers full, morning and afternoon", () => {
    const slots = day("2026-11-06");
    expect(slots.map((s) => [s.session, s.startsAt, s.endsAt])).toEqual([
      ["full", "2026-11-06T10:00:00.000Z", "2026-11-06T18:00:00.000Z"],
      ["half", "2026-11-06T10:00:00.000Z", "2026-11-06T14:00:00.000Z"],
      ["half", "2026-11-06T14:00:00.000Z", "2026-11-06T18:00:00.000Z"],
    ]);
  });
  test("shift days offer nothing", () => {
    expect(day("2026-11-04")).toEqual([]);
  });
  test("morning taken leaves only the afternoon", () => {
    const slots = day("2026-11-06", [], [{ starts_at: "2026-11-06T10:00:00.000Z", ends_at: "2026-11-06T14:00:00.000Z" }]);
    expect(slots.map((s) => [s.session, s.startsAt])).toEqual([["half", "2026-11-06T14:00:00.000Z"]]);
  });
  test("full day taken leaves nothing", () => {
    expect(day("2026-11-06", [], [{ starts_at: "2026-11-06T10:00:00.000Z", ends_at: "2026-11-06T18:00:00.000Z" }])).toEqual([]);
  });
  test("custom hours offer a single full day", () => {
    const custom: DayOverride[] = [{ date: "2026-11-06", open: true, start_time: "12:00", end_time: "18:00" }];
    const slots = day("2026-11-06", custom);
    expect(slots.map((s) => [s.session, s.startsAt, s.endsAt])).toEqual([
      ["full", "2026-11-06T12:00:00.000Z", "2026-11-06T18:00:00.000Z"],
    ]);
    expect(day("2026-11-06", custom, [{ starts_at: "2026-11-06T10:00:00.000Z", ends_at: "2026-11-06T14:00:00.000Z" }])).toEqual([]);
  });
  test("slots inside the minimum notice are dropped", () => {
    const slots = buildAvailability({ rota: ROTA, overrides: [], taken: [], from: "2026-11-06", to: "2026-11-06", now: new Date("2026-11-05T12:00:00Z") })[0].slots;
    expect(slots.map((s) => s.startsAt)).toEqual(["2026-11-06T14:00:00.000Z"]);
  });
  test("BST day: 10:00 London is 09:00Z", () => {
    const slots = buildAvailability({ rota: ROTA, overrides: [], taken: [], from: "2027-03-31", to: "2027-03-31", now: NOW })[0].slots;
    expect(slots[0].startsAt).toBe("2027-03-31T09:00:00.000Z");
  });
  test("labels name the session", () => {
    expect(day("2026-11-06").map((s) => s.label)).toEqual([
      "Full day · 10:00–18:00",
      "Morning · 10:00–14:00",
      "Afternoon · 14:00–18:00",
    ]);
  });
});

describe("partOfDay", () => {
  test("labels come from the booking itself, not the day's current hours", () => {
    expect(partOfDay("2026-11-06T10:00:00.000Z", "half")).toBe("Morning");
    expect(partOfDay("2026-11-06T14:00:00.000Z", "half")).toBe("Afternoon");
    expect(partOfDay("2026-11-06T12:00:00.000Z", "half")).toBe("Morning"); // 12–15 custom split
    expect(partOfDay("2026-11-06T15:00:00.000Z", "half")).toBe("Afternoon");
    expect(partOfDay("2026-11-06T10:00:00.000Z", "full")).toBe("Full day");
  });
  test("uses London time in summer", () => {
    expect(partOfDay("2027-06-02T09:00:00.000Z", "half")).toBe("Morning"); // 10:00 BST
    expect(partOfDay("2027-06-02T13:00:00.000Z", "half")).toBe("Afternoon"); // 14:00 BST
  });
});

test("odd default hours split on a whole minute", () => {
  const rota = { ...ROTA, day_end: "17:15" };
  const slots = buildAvailability({ rota, overrides: [], taken: [], from: "2026-11-06", to: "2026-11-06", now: NOW })[0].slots;
  expect(slots.map((s) => s.endsAt)).toContain("2026-11-06T13:37:00.000Z");
});
