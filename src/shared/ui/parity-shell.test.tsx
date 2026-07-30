import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { AppProviders } from "../../app/providers";
import { appRoutes } from "../../app/router";
import { createFixtureServices } from "../../infrastructure/fixture/services";

function renderRoute(path: string, services = createFixtureServices()) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<AppProviders authPort={services.auth}><RouterProvider router={router} /></AppProviders>);
  return { router, services };
}

async function authenticatedServices() {
  const services = createFixtureServices();
  await services.auth.register({ email: "shell-owner@example.com", password: "private-pass" });
  return services;
}

describe("canonical parity shell", () => {
  it("redirects unauthenticated Inicio to the public auth boundary", async () => {
    const { router } = renderRoute("/inicio");

    expect(await screen.findByRole("heading", { name: "Vuelve a tus decisiones." })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
  });

  it("fails closed for an unknown route", async () => {
    renderRoute("/ruta-inexistente");

    expect(await screen.findByRole("heading", { name: "Ruta no disponible" })).toBeInTheDocument();
    expect(screen.queryByText(/fixture/i)).not.toBeInTheDocument();
  });

  it.each([
    ["/progress", "/progreso"],
    ["/partnership", "/acuerdo"],
  ])("canonicalizes %s to %s", async (legacy, canonical) => {
    const services = await authenticatedServices();
    const { router } = renderRoute(legacy, services);

    await screen.findByRole("navigation", { name: "Navegación principal" });
    await waitFor(() => expect(router.state.location.pathname).toBe(canonical));
  });

  it("keeps four routes and one active item in each navigation", async () => {
    const user = userEvent.setup();
    const services = await authenticatedServices();
    renderRoute("/inicio", services);

    const desktop = await screen.findByRole("navigation", { name: "Navegación principal" });
    const mobile = screen.getByRole("navigation", { name: "Navegación móvil" });
    for (const navigation of [desktop, mobile]) {
      expect(within(navigation).getAllByRole("link")).toHaveLength(4);
      expect(within(navigation).getAllByRole("link", { current: "page" })).toHaveLength(1);
      expect(within(navigation).getByRole("link", { name: "Inicio", current: "page" })).toBeInTheDocument();
    }

    await user.click(within(desktop).getByRole("link", { name: "Progreso" }));
    expect(await screen.findByRole("heading", { name: "Tu progreso personal" })).toBeInTheDocument();
    expect(screen.getByText("Aprendizajes personales", { selector: ".topbar strong" })).toBeInTheDocument();
    for (const navigation of [desktop, mobile]) {
      expect(within(navigation).getAllByRole("link", { current: "page" })).toHaveLength(1);
      expect(within(navigation).getByRole("link", { name: "Progreso", current: "page" })).toBeInTheDocument();
    }
  });

  it("shows honest Inicio surfaces without deferred product claims", async () => {
    const services = await authenticatedServices();
    renderRoute("/inicio", services);

    expect(await screen.findByRole("heading", { name: "La próxima decisión sí cuenta." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sin un plan guardado" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Elige qué necesitas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sin estado de pareja mostrado" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aún no configurada" })).toBeInTheDocument();
    expect(screen.getByText(/No se envió ninguna solicitud\./)).toBeInTheDocument();
    expect(screen.queryByText(/PACTO-/)).not.toBeInTheDocument();
  });
});
