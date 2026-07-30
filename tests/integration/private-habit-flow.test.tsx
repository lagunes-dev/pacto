import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { appRoutes } from "../../src/app/router";
import {
  createFixtureServices,
  createFixtureStore,
} from "../../src/infrastructure/fixture/services";

type Services = ReturnType<typeof createFixtureServices>;

async function ownerServices() {
  const store = createFixtureStore();
  const services = createFixtureServices(store);
  await services.auth.register({
    email: "owner@pacto.test",
    password: "private-password",
  });
  return { services, store };
}

function renderRoute(services: Services, initialEntry: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [initialEntry] });
  render(
    <AppProviders
      authPort={services.auth}
      habitRepository={services.habits}
      progressRepository={services.progress}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe("private route integration", () => {
  it("redirects an unauthenticated private route to sign-in", async () => {
    const services = createFixtureServices(createFixtureStore());
    const router = renderRoute(services, "/habits/new");

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(
      await screen.findByRole("heading", { name: "Vuelve a tus decisiones." }),
    ).toBeInTheDocument();
  });

  it("creates a private habit from the routed keyboard flow and announces it", async () => {
    const user = userEvent.setup();
    const { services, store } = await ownerServices();
    renderRoute(services, "/habits/new");

    const name = await screen.findByLabelText("Nombre");
    name.focus();
    await user.keyboard("Respirar antes de responder");
    await user.tab();
    await user.selectOptions(screen.getByLabelText("Prioridad"), "2");
    await user.tab();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Hábito creado de forma privada",
    );
    expect(store.habits).toHaveLength(1);
    expect(store.habits[0]).toMatchObject({
      name: "Respirar antes de responder",
      priority: 2,
    });
  });

  it("keeps routed form data and tells the truth when saving is unavailable", async () => {
    const user = userEvent.setup();
    const { services, store } = await ownerServices();
    const unavailableServices: Services = {
      ...services,
      habits: {
        ...services.habits,
        create: async () => {
          throw new Error("Servicio temporalmente no disponible.");
        },
      },
    };
    renderRoute(unavailableServices, "/habits/new");

    const name = await screen.findByLabelText("Nombre");
    await user.type(name, "Pedir una pausa");
    await user.click(screen.getByRole("button", { name: "Crear hábito" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se guardaron cambios");
    expect(name).toHaveValue("Pedir una pausa");
    expect(store.habits).toHaveLength(0);
  });

  it("retries a routed progress request without inventing data", async () => {
    const user = userEvent.setup();
    const { services } = await ownerServices();
    let attempts = 0;
    const retryServices: Services = {
      ...services,
      progress: {
        getMine: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("Servicio temporalmente no disponible.");
          }
          return { habits: [], completedEntryCount: 0, activeDayCount: 0 };
        },
      },
    };
    renderRoute(retryServices, "/progress");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No mostramos datos sin confirmar",
    );
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByText("No hay actividad persistida ni métricas para mostrar todavía."),
    ).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
