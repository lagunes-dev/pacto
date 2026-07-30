import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { createFixtureServices } from "../infrastructure/fixture/services";
import { AppProviders } from "./providers";
import { appRoutes } from "./router";

function renderRoute(path: string, services = createFixtureServices()) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<AppProviders authPort={services.auth}><RouterProvider router={router} /></AppProviders>);
  return { router, services };
}

describe("Pacto routed shell", () => {
  it("renders public auth without dashboard navigation", async () => {
    renderRoute("/sign-in");

    expect(await screen.findByRole("heading", { name: "Vuelve a tus decisiones." })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Barra lateral" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegación principal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegación móvil" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders dashboard navigation for private routes", async () => {
    const services = createFixtureServices();
    await services.auth.register({ email: "owner@example.com", password: "private-pass" });
    renderRoute("/progress", services);
    expect(await screen.findByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Barra lateral" })).toBeInTheDocument();
    expect(document.querySelector(".safe-area-top")).toBeInTheDocument();
    expect(document.querySelector(".safe-area-bottom")).toBeInTheDocument();
  });

  it.each(["/habits/new", "/progress"])("guards %s without claiming authentication", (path) => {
    const { router } = renderRoute(path);

    return screen.findByRole("heading", { name: "Vuelve a tus decisiones." }).then(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
  });

  it("exposes a visible-focus keyboard path", async () => {
    const user = userEvent.setup();
    renderRoute("/sign-in");

    await user.tab();
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveFocus();
  });

});
