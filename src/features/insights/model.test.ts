import { derivePersonalInsights } from "./model";

const event = (trigger: string, moment: string, alternative: string) => ({
  trigger, moment, alternative, recordedAt: "2026-07-31T12:00:00Z",
});

describe("personal insight derivation", () => {
  it("waits for three events and resolves frequency ties deterministically", () => {
    expect(derivePersonalInsights([event("Estrés", "Noche", "Té"), event("Estrés", "Noche", "Té")], []).frequentTrigger).toBeNull();

    const result = derivePersonalInsights([
      event("Hambre", "Noche", "Yogur"),
      event("Estrés", "Noche", "Fruta"),
      event("estrés", "Tarde", "Yogur"),
      event("Hambre", "Tarde", "Fruta"),
    ], []);

    expect(result.frequentTrigger).toEqual({ value: "Estrés", occurrences: 2 });
    expect(result.frequentMoment).toEqual({ value: "Noche", occurrences: 2 });
    expect(result.effectiveAlternative).toEqual({ value: "Fruta", occurrences: 2 });
  });

  it("uses only confirmed non-negative response intervals", () => {
    const result = derivePersonalInsights([], [
      { createdAt: "2026-07-31T10:00:00Z", acknowledgedAt: "2026-07-31T10:10:00Z" },
      { createdAt: "2026-07-31T10:00:00Z", acknowledgedAt: "2026-07-31T10:30:00Z" },
      { createdAt: "2026-07-31T10:00:00Z", acknowledgedAt: null },
      { createdAt: "2026-07-31T10:00:00Z", acknowledgedAt: "invalid" },
    ]);

    expect(result).toMatchObject({ supportRequestedCount: 4, supportRespondedCount: 2, averageSupportResponseMinutes: 20 });
  });
});
