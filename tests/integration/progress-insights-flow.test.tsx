import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { ProgressRoute } from "../../src/features/progress/components/ProgressRoute";
import type { PersonalProgress } from "../../src/features/progress/model";
import { createFixtureServices } from "../../src/infrastructure/fixture/services";

const populated: PersonalProgress = {
  habits: [], completedEntryCount: 4, activeDayCount: 4,
  evidence: {
    personal: {
      eventCount: 3, executedPlanCount: 3,
      frequentTrigger: { value: "Estrés", occurrences: 2 },
      frequentMoment: { value: "Después de cenar", occurrences: 3 },
      effectiveAlternative: { value: "Yogur con fruta", occurrences: 2 },
      supportRequestedCount: 3, supportRespondedCount: 2, averageSupportResponseMinutes: 12,
    },
    cooperation: { checkinsCompleted: 8, supportRequestsResponded: 2, reviewsCompleted: 1 },
  },
};

async function renderProgress(result: PersonalProgress | (() => Promise<PersonalProgress>)) {
  const services = createFixtureServices();
  await services.auth.register({ email: "alex@pacto.test", password: "private-password" });
  const getMine = typeof result === "function" ? result : vi.fn().mockResolvedValue(result);
  render(<MemoryRouter><AppProviders authPort={services.auth} progressRepository={{ getMine }} backgroundSync={false}><ProgressRoute /></AppProviders></MemoryRouter>);
}

afterEach(cleanup);

describe("personal progress insights", () => {
  it("renders bounded evidence, a neutral action, support metrics, and aggregate cooperation", async () => {
    await renderProgress(populated);

    expect(await screen.findByText(/Estrés podría ser un detonante frecuente/i)).toBeInTheDocument();
    expect(screen.getByText(/Después de cenar aparece en 3 de 3 registros/i)).toBeInTheDocument();
    expect(screen.getByText(/Yogur con fruta podría ser tu alternativa más efectiva/i)).toBeInTheDocument();
    expect(screen.getByText(/Respuesta en 12 min en promedio/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cooperación semanal" })).toHaveTextContent("8");

    const page = document.body.textContent ?? "";
    expect(page).not.toMatch(/ranking|cumplimiento combinado|tasa de tu pareja|culpa/i);
  });

  it("requires at least three events before suggesting a pattern", async () => {
    await renderProgress({ ...populated, evidence: { personal: { ...populated.evidence!.personal, eventCount: 2, executedPlanCount: 2, frequentTrigger: null, frequentMoment: null, effectiveAlternative: null }, cooperation: null } });

    expect(await screen.findByText(/Falta un registro para identificar patrones/i)).toBeInTheDocument();
    expect(screen.queryByText(/podría ser un detonante frecuente/i)).not.toBeInTheDocument();
    expect(screen.getByText(/El resumen compartido no está disponible/i)).toBeInTheDocument();
  });

  it("shows a retryable error without preserving unconfirmed metrics", async () => {
    const user = userEvent.setup();
    const getMine = vi.fn()
      .mockRejectedValueOnce(new Error("Lectura interrumpida."))
      .mockResolvedValueOnce(populated);
    await renderProgress(getMine);

    expect(await screen.findByRole("alert")).toHaveTextContent("No mostramos datos sin confirmar");
    expect(screen.queryByText(/Yogur con fruta/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/Yogur con fruta podría/)).toBeInTheDocument();
  });
});
