import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { createFixtureServices } from "../infrastructure/fixture/services";
import { AppProviders } from "./providers";
import { appRoutes } from "./router";

function renderRoute(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const services = createFixtureServices();
  render(<AppProviders authPort={services.auth}><RouterProvider router={router} /></AppProviders>);
  return { router, services };
}

describe("Pacto routed shell", () => {
  it("renders the identity and responsive navigation landmarks", async () => {
    renderRoute("/sign-in");

    expect(await screen.findByRole("heading", { name: "Volvé a tus decisiones." })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Barra lateral" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegación móvil" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it.each(["/habits/new", "/progress"])("guards %s without claiming authentication", (path) => {
    const { router } = renderRoute(path);

    return screen.findByRole("heading", { name: "Volvé a tus decisiones." }).then(() => {
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
