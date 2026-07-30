import { describe, expect, it } from "vitest";

import { createFixtureServices, createFixtureStore } from "./services";

describe("daily check-in fixture seam", () => {
  it("uses the same owner/local-day idempotence as the production repository", async () => {
    const store = createFixtureStore();
    const services = createFixtureServices(store, () => new Date("2026-07-30T04:30:00.000Z"));
    await services.auth.register({ email: "fixture@example.test", password: "correct-horse-battery-staple" });
    const goal = await services.habits.create({ name: "Prepared alternative", priority: 1 });

    const today = await services.checkin.loadToday();
    expect(today).toMatchObject({
      entryDate: "2026-07-29",
      timezone: "America/Mexico_City",
      timezoneSource: "default",
      goals: [{ id: goal.id, answer: null }],
    });

    const first = await services.checkin.save({
      timezone: today.timezone,
      cravingLevel: 2,
      habits: [{ goalId: goal.id, state: "done", trigger: null }],
    });
    const revised = await services.checkin.save({
      timezone: today.timezone,
      cravingLevel: 4,
      habits: [{ goalId: goal.id, state: "event", trigger: "Estrés" }],
    });

    expect(revised.id).toBe(first.id);
    expect(revised).toMatchObject({ cravingLevel: 4, habits: [{ state: "event", trigger: "Estrés" }] });
    expect(store.checkins).toHaveLength(1);
  });
});
