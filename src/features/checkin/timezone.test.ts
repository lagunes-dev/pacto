import { describe, expect, it } from "vitest";

import { DEFAULT_TIMEZONE, localDayAt, resolveTimezone } from "./timezone";

describe("daily check-in timezone", () => {
  it("gives a valid profile timezone authority over the browser", () => {
    expect(resolveTimezone({
      profileTimezone: "Pacific/Auckland",
      browserTimezone: "America/Los_Angeles",
      browserTimezoneConfirmed: true,
    })).toEqual({ timezone: "Pacific/Auckland", source: "profile", requiresBrowserConfirmation: false });
  });

  it("defaults to Mexico City when profile timezone is absent", () => {
    expect(resolveTimezone({})).toEqual({
      timezone: DEFAULT_TIMEZONE,
      source: "default",
      requiresBrowserConfirmation: false,
    });
  });

  it("does not use a browser timezone before explicit confirmation", () => {
    expect(resolveTimezone({ browserTimezone: "Europe/London" })).toEqual({
      timezone: DEFAULT_TIMEZONE,
      source: "default",
      requiresBrowserConfirmation: true,
    });
    expect(resolveTimezone({ browserTimezone: "Europe/London", browserTimezoneConfirmed: true })).toEqual({
      timezone: "Europe/London",
      source: "browser",
      requiresBrowserConfirmation: false,
    });
  });

  it("derives the local calendar day rather than slicing UTC", () => {
    const instant = new Date("2026-07-30T04:30:00.000Z");
    expect(localDayAt(instant, "America/Mexico_City")).toBe("2026-07-29");
    expect(localDayAt(instant, "Pacific/Auckland")).toBe("2026-07-30");
  });

  it("stays aligned across daylight-saving transitions", () => {
    expect(localDayAt(new Date("2026-03-08T07:30:00.000Z"), "America/New_York")).toBe("2026-03-08");
    expect(localDayAt(new Date("2026-11-01T05:30:00.000Z"), "America/New_York")).toBe("2026-11-01");
  });
});
