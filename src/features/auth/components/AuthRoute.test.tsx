import "fake-indexeddb/auto";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { AppProviders } from "../../../app/providers";
import { appRoutes } from "../../../app/router";
import { createFixtureServices } from "../../../infrastructure/fixture/services";
import type { AuthPort } from "../port";

function renderAuth() {
  const router = createMemoryRouter(appRoutes, { initialEntries: ["/register"] });
  const services = createFixtureServices();
  render(<AppProviders authPort={services.auth}><RouterProvider router={router} /></AppProviders>);
  return router;
}

describe("authentication boundary", () => {
  it("registers, enters a protected route, and logs out", async () => {
    const user = userEvent.setup();
    const router = renderAuth();
    await screen.findByRole("heading", { name: "Creá tu cuenta privada." });
    await user.type(screen.getByLabelText("Correo"), "owner@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "private-pass");
    await user.click(screen.getByRole("button", { name: "Registrarme" }));
    expect(await screen.findByRole("heading", { name: "Tu progreso personal" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByRole("heading", { name: "Volvé a tus decisiones." })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
  });

  it("associates Zod errors and preserves safe values", async () => {
    const user = userEvent.setup();
    renderAuth();
    await screen.findByRole("heading", { name: "Creá tu cuenta privada." });
    const email = screen.getByLabelText("Correo");
    await user.type(email, "not-an-email");
    await user.type(screen.getByLabelText("Contraseña"), "short");
    await user.click(screen.getByRole("button", { name: "Registrarme" }));
    expect(email).toHaveValue("not-an-email");
    expect(email).toHaveAccessibleDescription("Ingresá un correo válido.");
  });

  it("reports an unavailable auth boundary when the initial session lookup rejects", async () => {
    const unavailableAuth: AuthPort = {
      getSession: () => Promise.reject(new Error("Falta la configuración pública de Supabase.")),
      register: () => Promise.reject(new Error("Unavailable")),
      login: () => Promise.reject(new Error("Unavailable")),
      logout: () => Promise.reject(new Error("Unavailable")),
    };
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/sign-in"] });

    render(<AppProviders authPort={unavailableAuth}><RouterProvider router={router} /></AppProviders>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Autenticación no disponible: Falta la configuración pública de Supabase.");
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });
});
