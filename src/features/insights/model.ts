import type { WeeklyCooperation } from "../weekly-review/model";

export const MINIMUM_INSIGHT_EVENTS = 3;

export type ProgressEventEvidence = {
  trigger: string;
  moment: string;
  alternative: string;
  recordedAt: string;
};

export type SupportResponseEvidence = {
  createdAt: string;
  acknowledgedAt: string | null;
};

export type FrequentEvidence = { value: string; occurrences: number };

export type PersonalInsights = {
  eventCount: number;
  executedPlanCount: number;
  frequentTrigger: FrequentEvidence | null;
  frequentMoment: FrequentEvidence | null;
  effectiveAlternative: FrequentEvidence | null;
  supportRequestedCount: number;
  supportRespondedCount: number;
  averageSupportResponseMinutes: number | null;
};

export type ProgressEvidence = {
  personal: PersonalInsights;
  cooperation: WeeklyCooperation | null;
};

function mostFrequent(values: string[]): FrequentEvidence | null {
  const counts = new Map<string, { value: string; occurrences: number }>();
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("es-MX");
    const current = counts.get(key);
    counts.set(key, { value: current?.value ?? value, occurrences: (current?.occurrences ?? 0) + 1 });
  }
  const [first] = [...counts.values()].sort((a, b) =>
    b.occurrences - a.occurrences || a.value.localeCompare(b.value, "es-MX"));
  return first && first.occurrences >= 2 ? first : null;
}

export function derivePersonalInsights(
  events: ProgressEventEvidence[],
  supportResponses: SupportResponseEvidence[],
): PersonalInsights {
  const hasEnoughEvidence = events.length >= MINIMUM_INSIGHT_EVENTS;
  const responseMinutes = supportResponses.flatMap(({ createdAt, acknowledgedAt }) => {
    if (!acknowledgedAt) return [];
    const elapsed = (Date.parse(acknowledgedAt) - Date.parse(createdAt)) / 60_000;
    return Number.isFinite(elapsed) && elapsed >= 0 ? [elapsed] : [];
  });

  return {
    eventCount: events.length,
    executedPlanCount: events.length,
    frequentTrigger: hasEnoughEvidence ? mostFrequent(events.map(({ trigger }) => trigger)) : null,
    frequentMoment: hasEnoughEvidence ? mostFrequent(events.map(({ moment }) => moment)) : null,
    effectiveAlternative: hasEnoughEvidence ? mostFrequent(events.map(({ alternative }) => alternative)) : null,
    supportRequestedCount: supportResponses.length,
    supportRespondedCount: responseMinutes.length,
    averageSupportResponseMinutes: responseMinutes.length
      ? Math.round(responseMinutes.reduce((total, value) => total + value, 0) / responseMinutes.length)
      : null,
  };
}

export const emptyProgressEvidence = (): ProgressEvidence => ({
  personal: derivePersonalInsights([], []),
  cooperation: null,
});
