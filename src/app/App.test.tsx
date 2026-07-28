import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { appRoutes } from "./router";

function renderRoute(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("Pacto routed shell", () => {
  it("renders the identity and responsive navigation landmarks", () => {
    renderRoute("/sign-in");

    expect(screen.getByRole("complementary", { name: "Barra lateral" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegación móvil" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Volvé a tus decisiones." })).toBeInTheDocument();
  });

  it.each(["/habits/new", "/progress"])("guards %s without claiming authentication", (path) => {
    const router = renderRoute(path);

    expect(router.state.location.pathname).toBe("/sign-in");
    expect(screen.getByText(/autenticación real se conectará/i)).toBeInTheDocument();
  });

  it("exposes a visible-focus keyboard path", async () => {
    const user = userEvent.setup();
    renderRoute("/sign-in");

    await user.tab();
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveFocus();
  });
});
