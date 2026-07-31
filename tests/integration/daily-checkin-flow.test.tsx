import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { appRoutes } from "../../src/app/router";
import type { DailyCheckinView, SavedCheckin } from "../../src/features/checkin/model";
import type { DailyCheckinRepository } from "../../src/features/checkin/repository";
import { createFixtureServices, createFixtureStore } from "../../src/infrastructure/fixture/services";

type Services = ReturnType<typeof createFixtureServices>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function ownerServices(withGoal = true) {
  const store = createFixtureStore();
  const services = createFixtureServices(store, () => new Date("2026-07-30T18:00:00Z"));
  await services.auth.register({ email: "owner@pacto.test", password: "private-password" });
  if (withGoal) await services.habits.create({ name: "Elegir agua", priority: 1 });
  return { services, store };
}

function renderHome(services: Services, checkinRepository: DailyCheckinRepository = services.checkin) {
  const router = createMemoryRouter(appRoutes, { initialEntries: ["/inicio"] });
  render(
    <AppProviders
      authPort={services.auth}
      habitRepository={services.habits}
      progressRepository={services.progress}
      checkinRepository={checkinRepository}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

async function confirmTimezoneIfRequested(user: ReturnType<typeof userEvent.setup>) {
  const checkbox = screen.queryByRole("checkbox", { name: /Confirmo usar la zona horaria/ });
  if (checkbox) {
    await user.click(checkbox);
    await screen.findByRole("heading", { name: "¿Cómo va tu día?" });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
});

describe("daily check-in flow", () => {
  it("opens one intervention for a high-craving episode and never for levels 1 to 3", async () => {
    const user = userEvent.setup();
    const { services } = await ownerServices();
    renderHome(services);
    await screen.findByRole("heading", { name: "¿Cómo va tu día?" });

    await user.click(screen.getByRole("button", { name: "Antojo 3 de 5" }));
    expect(screen.queryByRole("dialog", { name: "El antojo está alto" })).not.toBeInTheDocument();

    const highTrigger = screen.getByRole("button", { name: "Antojo 4 de 5" });
    await user.click(highTrigger);
    expect(screen.getByRole("dialog", { name: "El antojo está alto" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(highTrigger).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Antojo 5 de 5" }));
    expect(screen.queryByRole("dialog", { name: "El antojo está alto" })).not.toBeInTheDocument();
  });

  it("does not claim that selecting an intervention action saved the check-in", async () => {
    const user = userEvent.setup();
    const { services } = await ownerServices();
    renderHome(services);
    await screen.findByRole("heading", { name: "¿Cómo va tu día?" });

    await user.click(screen.getByRole("button", { name: "Antojo 4 de 5" }));
    await user.click(screen.getByRole("button", { name: /Elegir una alternativa/ }));
    await user.click(screen.getByRole("button", { name: "Usar esta acción" }));

    expect(screen.getByRole("status")).toHaveTextContent("Esta elección no se guardó ni se compartió automáticamente.");
    expect(screen.queryByText(/Check-in guardado/)).not.toBeInTheDocument();
  });
  it("shows loading and then the empty active-goal state", async () => {
    const { services } = await ownerServices(false);
    const loading = deferred<DailyCheckinView>();
    renderHome(services, { ...services.checkin, loadToday: () => loading.promise });

    expect(await screen.findByRole("status")).toHaveTextContent("Cargando tus metas");
    loading.resolve({
      entryDate: "2026-07-30",
      timezone: "America/Mexico_City",
      timezoneSource: "default",
      requiresBrowserConfirmation: false,
      goals: [],
      saved: null,
    });

    expect(await screen.findByRole("heading", { name: "Primero agrega una meta activa" })).toBeInTheDocument();
  });

  it("renders a load error and retries without inventing check-in data", async () => {
    const user = userEvent.setup();
    const { services } = await ownerServices(false);
    let attempts = 0;
    const repository: DailyCheckinRepository = {
      ...services.checkin,
      loadToday: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("Servicio temporalmente no disponible.");
        return {
          entryDate: "2026-07-30",
          timezone: "America/Mexico_City",
          timezoneSource: "default",
          requiresBrowserConfirmation: false,
          goals: [],
          saved: null,
        };
      },
    };
    renderHome(services, repository);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tu check-in");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Primero agrega una meta activa" })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("validates unresolved answers and keeps the local draft after a failed save", async () => {
    const user = userEvent.setup();
    const { services, store } = await ownerServices();
    let attempts = 0;
    const save = vi.fn(async (input) => {
      attempts += 1;
      if (attempts === 1) throw new Error("No hay conexión con el servicio.");
      return services.checkin.save(input);
    });
    renderHome(services, { ...services.checkin, save });
    await screen.findByRole("heading", { name: "¿Cómo va tu día?" });
    await confirmTimezoneIfRequested(user);

    await user.click(screen.getByRole("button", { name: "Guardar check-in" }));
    const validation = await screen.findByRole("alert");
    expect(validation).toHaveTextContent("Falta registrar 1 meta");
    expect(validation).toHaveFocus();
    expect(save).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Hubo evento" }));
    await user.click(screen.getByRole("button", { name: "Antojo" }));
    await user.click(screen.getByRole("button", { name: "Antojo 3 de 5" }));
    await user.click(screen.getByRole("button", { name: "Guardar check-in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se guardó tu check-in");
    expect(screen.getByRole("button", { name: "Hubo evento" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Antojo" })).toHaveAttribute("aria-pressed", "true");
    expect(store.checkins.size).toBe(0);

    await user.click(screen.getByRole("button", { name: "Reintentar guardar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Check-in guardado");
    expect(store.checkins.size).toBe(1);
    expect(save).toHaveBeenLastCalledWith({
      timezone: expect.any(String),
      cravingLevel: 3,
      habits: [{ goalId: store.habits[0].id, state: "event", trigger: "Antojo" }],
    });
  });

  it("announces success only after the repository confirms the save", async () => {
    const user = userEvent.setup();
    const { services } = await ownerServices();
    const pending = deferred<SavedCheckin>();
    renderHome(services, { ...services.checkin, save: () => pending.promise });
    await screen.findByRole("heading", { name: "¿Cómo va tu día?" });
    await confirmTimezoneIfRequested(user);
    await user.click(screen.getByRole("button", { name: "Cumplido" }));
    await user.click(screen.getByRole("button", { name: "Antojo 2 de 5" }));
    await user.click(screen.getByRole("button", { name: "Guardar check-in" }));

    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.queryByText(/Check-in guardado/)).not.toBeInTheDocument();
    pending.resolve({
      id: crypto.randomUUID(),
      entryDate: "2026-07-30",
      cravingLevel: 2,
      completedAt: "2026-07-30T18:00:00Z",
      habits: [],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Check-in guardado");
  });

  it("blocks offline persistence without queueing or claiming a save", async () => {
    const user = userEvent.setup();
    const { services } = await ownerServices();
    const save = vi.fn(services.checkin.save);
    renderHome(services, { ...services.checkin, save });
    await screen.findByRole("heading", { name: "¿Cómo va tu día?" });
    await confirmTimezoneIfRequested(user);
    await user.click(screen.getByRole("button", { name: "Cumplido" }));
    await user.click(screen.getByRole("button", { name: "Antojo 1 de 5" }));
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    await user.click(screen.getByRole("button", { name: "Guardar check-in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se guardaron ni se pusieron en espera");
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByText(/Check-in guardado/)).not.toBeInTheDocument();
  });
});
