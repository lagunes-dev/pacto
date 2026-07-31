import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { appRoutes } from "../../src/app/router";
import type { RecoveryRecord } from "../../src/features/recovery/model";
import type { RecoveryRepository } from "../../src/features/recovery/repository";
import { createFixtureServices } from "../../src/infrastructure/fixture/services";
import { createTestOfflineQueue } from "./testOfflineQueue";

type Services = ReturnType<typeof createFixtureServices>;

async function ownerServices() {
  const services = createFixtureServices(undefined, () => new Date("2026-07-31T18:00:00Z"));
  await services.auth.register({ email: "owner@pacto.test", password: "private-password" });
  return services;
}

function renderPath(path: string, services: Services, recovery: RecoveryRepository = services.recovery) {
  render(<AppProviders authPort={services.auth} habitRepository={services.habits} progressRepository={services.progress} checkinRepository={services.checkin} recoveryRepository={recovery} offlineQueue={createTestOfflineQueue()}><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} /></AppProviders>);
}

async function fillPlan(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText("¿Qué ocurrió?"), "Antojo");
  await user.selectOptions(screen.getByLabelText("Momento"), "Después de cenar");
  await user.selectOptions(screen.getByLabelText("¿Qué necesitabas?"), "Reducir estrés");
  await user.type(screen.getByLabelText("Alternativa para la próxima vez"), "tomaré agua y esperaré diez minutos");
  await user.type(screen.getByPlaceholderText("Sólo tú puedes leer esto."), "Esto sólo me pertenece");
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
});

describe("Registro and Home recovery flow", () => {
  it("previews, saves, clears and renders a confirmed plan without exposing the note", async () => {
    const user = userEvent.setup();
    const services = await ownerServices();
    const save = vi.spyOn(services.recovery, "save");
    renderPath("/registro", services);
    await screen.findByText("No hay planes guardados todavía.");

    await fillPlan(user);
    expect(screen.getByText(/Si vuelve el antojo después de cenar, entonces tomaré agua/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar plan y continuar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Plan guardado");
    expect(await screen.findByText("Antojo · Después de cenar")).toBeInTheDocument();
    expect(screen.queryByText("Esto sólo me pertenece")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ trigger: "Antojo", need: "Reducir estrés", privateNote: "Esto sólo me pertenece" }));

    await user.type(screen.getByLabelText("Alternativa para la próxima vez"), "borrador");
    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(screen.getByLabelText("Alternativa para la próxima vez")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("No se guardó ningún cambio");
  });

  it("keeps a failed draft, retries timeline reads and invents no Home value", async () => {
    const user = userEvent.setup();
    const services = await ownerServices();
    let attempts = 0;
    const repository: RecoveryRepository = {
      save: vi.fn(async () => { throw new Error("Servicio temporalmente no disponible."); }),
      timeline: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("Lectura temporalmente no disponible.");
        return [];
      },
    };
    renderPath("/registro", services, repository);
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tus registros");
    expect(screen.queryByText(/Antojo nocturno|yogur natural/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay planes guardados todavía.")).toBeInTheDocument();
    await fillPlan(user);
    await user.click(screen.getByRole("button", { name: "Guardar plan y continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se guardó el plan");
    expect(screen.getByPlaceholderText("Sólo tú puedes leer esto.")).toHaveValue("Esto sólo me pertenece");
  });

  it("shows the saved projection on Home and never renders its private note", async () => {
    const services = await ownerServices();
    await services.recovery.save({ operationId: crypto.randomUUID(), expectedRevision: 0, trigger: "Estrés", moment: "Durante el trabajo", need: "Tomar una pausa", alternative: "respiraré y caminaré", privateNote: "No compartir" });
    renderPath("/inicio", services);
    expect(await screen.findByRole("heading", { name: "Durante el trabajo" })).toBeInTheDocument();
    expect(screen.getByText("Si vuelve el estrés, entonces respiraré y caminaré.")).toBeInTheDocument();
    expect(screen.queryByText("No compartir")).not.toBeInTheDocument();
  });

  it("keeps an offline private-note draft without queueing or calling the repository", async () => {
    const user = userEvent.setup();
    const services = await ownerServices();
    const save = vi.spyOn(services.recovery, "save");
    renderPath("/registro", services);
    await fillPlan(user);
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    await user.click(screen.getByRole("button", { name: "Guardar plan y continuar" }));
    expect(await screen.findByText(/Las notas privadas no se ponen en espera/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
