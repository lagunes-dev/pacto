import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { appRoutes } from "../../src/app/router";
import type { PartnershipRepository } from "../../src/features/partnership/repository";
import { createFixtureServices, createFixtureStore } from "../../src/infrastructure/fixture/services";

type Services = ReturnType<typeof createFixtureServices>;

function renderRoute(services: Services, entry: string, partnership = services.partnership) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [entry] });
  render(<AppProviders authPort={services.auth} habitRepository={services.habits} progressRepository={services.progress} partnershipRepository={partnership} preferenceRepository={services.preferences} supportRepository={services.support}><RouterProvider router={router} /></AppProviders>);
  return router;
}

async function twoUsers() {
  const store = createFixtureStore();
  const first = createFixtureServices(store);
  const second = createFixtureServices(store);
  await first.auth.register({ email: "alex@pacto.test", password: "private-password" });
  await second.auth.register({ email: "sam@pacto.test", password: "private-password" });
  return { first, second };
}

async function activeUsers() {
  const users = await twoUsers();
  const invite = await users.first.partnership.createInvite("sam@pacto.test");
  await users.second.partnership.acceptInvite(invite.code);
  return users;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("partnership routes", () => {
  it("guards partnership, preference, and support routes", async () => {
    const services = createFixtureServices(createFixtureStore());
    for (const path of ["/partnership", "/partnership/preferences", "/partnership/support"]) {
      const router = renderRoute(services, path);
      await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
      cleanup();
    }
  });

  it("creates and explicitly accepts an invite through neutral, accessible UI", async () => {
    const user = userEvent.setup();
    const { first, second } = await twoUsers();
    renderRoute(first, "/partnership");
    await user.type(await screen.findByLabelText("Correo de la persona invitada"), "sam@pacto.test");
    await user.click(screen.getByRole("button", { name: "Crear invitación" }));
    const codeCopy = await screen.findByText(/Código de invitación:/);
    const code = codeCopy.textContent?.match(/Código de invitación: (.+)$/)?.[1];
    expect(code).toBeTruthy();

    cleanup();
    renderRoute(second, "/partnership");
    await user.type(await screen.findByLabelText("Código de invitación"), code!);
    await user.click(screen.getByRole("button", { name: "Aceptar invitación" }));
    expect(await screen.findByText("El apoyo está habilitado solamente mediante acciones explícitas.")).toBeInTheDocument();
  });

  it("keeps invite decisions in an accessible responsive action group", async () => {
    const { second } = await twoUsers();
    renderRoute(second, "/partnership");

    const accept = await screen.findByRole("button", { name: "Aceptar invitación" });
    const reject = screen.getByRole("button", { name: "Rechazar invitación" });
    expect(accept).toHaveClass("primary-button");
    expect(reject).toHaveClass("danger-button");
    expect(accept.closest(".invite-actions")).toBe(reject.closest(".invite-actions"));
  });

  it("shows one neutral error for invalid or expired-style invite failures and moves focus", async () => {
    const user = userEvent.setup();
    const { second } = await twoUsers();
    renderRoute(second, "/partnership");
    await user.type(await screen.findByLabelText("Código de invitación"), "unknown-code");
    await user.click(screen.getByRole("button", { name: "Aceptar invitación" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("La solicitud no está disponible");
    expect(alert).toHaveFocus();
  });

  it("announces an initial partnership query failure and moves focus for recovery", async () => {
    const { first } = await twoUsers();
    const unavailable: PartnershipRepository = {
      ...first.partnership,
      getMine: async () => { throw new Error("sensitive adapter failure"); },
    };
    renderRoute(first, "/partnership", unavailable);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("La solicitud no está disponible");
    expect(alert).not.toHaveTextContent("sensitive adapter failure");
    expect(alert).toHaveFocus();
  });

  it("updates only the signed-in person's preferences", async () => {
    const user = userEvent.setup();
    const { first, second } = await activeUsers();
    renderRoute(first, "/partnership/preferences");
    await user.click(await screen.findByLabelText("Porcentajes personales"));
    await user.click(screen.getByLabelText("Preguntar antes de dar consejos"));
    await user.clear(screen.getByLabelText("Apoyo preferido"));
    await user.type(screen.getByLabelText("Apoyo preferido"), "Escúchame primero");
    await user.click(screen.getByRole("button", { name: "Guardar mis preferencias" }));
    expect(await screen.findByRole("status")).toHaveTextContent("actualizadas");
    expect(await first.preferences.getMine()).toMatchObject({ sharePercentages: true, askBeforeAdvice: false, preferredSupport: "Escúchame primero" });
    expect(await second.preferences.getMine()).toMatchObject({ sharePercentages: false, askBeforeAdvice: true });
  });

  it("saves only explicit setup choices and never creates a partnership", async () => {
    const user = userEvent.setup();
    const { first } = await twoUsers();
    renderRoute(first, "/inicio");
    await user.click(await screen.findByRole("button", { name: "Abrir configuración inicial" }));
    await user.clear(screen.getByLabelText("Objetivo personal"));
    await user.type(screen.getByLabelText("Objetivo personal"), "Caminar después de comer");
    await user.click(screen.getByLabelText("Estado general"));
    await user.click(screen.getByLabelText("Preguntar antes de dar consejos"));
    await user.click(screen.getByLabelText(/Confirmo que estas son mis decisiones/));
    await user.click(screen.getByRole("button", { name: "Guardar mis decisiones" }));
    expect(await screen.findByText("Configuración guardada. No se creó ningún vínculo.")).toBeInTheDocument();
    expect(await first.partnership.getMine()).toBeNull();
    expect(await first.preferences.getMine()).toMatchObject({ shareGeneralStatus: true, shareCheckinCompleted: false, askBeforeAdvice: true });
    expect(await first.habits.listMine()).toEqual([expect.objectContaining({ name: "Caminar después de comer" })]);
  });

  it("requires both members to resume a paused partnership", async () => {
    const user = userEvent.setup();
    const { first, second } = await activeUsers();
    await first.partnership.pause();
    renderRoute(first, "/partnership");
    await user.click(await screen.findByRole("button", { name: "Solicitar reactivación" }));
    expect(await screen.findByText(/sigue pausado hasta que la otra persona confirme/)).toBeInTheDocument();
    expect((await first.partnership.getMine())?.status).toBe("paused");
    cleanup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderRoute(second, "/partnership");
    await user.click(await screen.findByRole("button", { name: "Confirmar reactivación" }));
    expect(await screen.findByText("El apoyo está habilitado solamente mediante acciones explícitas.")).toBeInTheDocument();
  });

  it("supports explicit request, acknowledge, and close without automatic alerts", async () => {
    const user = userEvent.setup();
    const { first, second } = await activeUsers();
    renderRoute(first, "/partnership/support");
    expect(await screen.findByText(/No genera alertas automáticas/)).toBeInTheDocument();
    await user.selectOptions(await screen.findByLabelText("Tipo de apoyo"), "practical_help");
    await user.click(screen.getByRole("button", { name: "Solicitar apoyo" }));
    expect(await screen.findByText("Solicitada por ti · pending")).toBeInTheDocument();

    cleanup();
    renderRoute(second, "/partnership/support");
    await user.click(await screen.findByRole("button", { name: "Reconocer" }));
    await user.click(await screen.findByRole("button", { name: "Cerrar" }));
    expect(await screen.findByText("Solicitada por tu vínculo · closed")).toBeInTheDocument();
  });

  it("revokes support UI immediately on pause and keeps the terminal action neutral", async () => {
    const user = userEvent.setup();
    const { first } = await activeUsers();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderRoute(first, "/partnership");
    expect(await screen.findByRole("link", { name: "Solicitudes de apoyo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pausar vínculo" }));
    expect(await screen.findByText(/El acceso de apoyo está revocado/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Solicitudes de apoyo" })).not.toBeInTheDocument();
    cleanup();
    renderRoute(first, "/partnership/support");
    expect(await screen.findByRole("alert")).toHaveTextContent("La solicitud no está disponible");
    expect(screen.queryByRole("button", { name: "Solicitar apoyo" })).not.toBeInTheDocument();
    cleanup();
    renderRoute(first, "/partnership");
    await user.click(await screen.findByRole("button", { name: "Finalizar vínculo" }));
    expect(await screen.findByText("Este vínculo terminó y no puede reactivarse desde esta versión.")).toBeInTheDocument();
  });

  it("never renders private-note or unrelated fields from an unsafe adapter result", async () => {
    const { first } = await activeUsers();
    const unsafe: PartnershipRepository = {
      ...first.partnership,
      getMine: async () => ({ ...(await first.partnership.getMine())!, privateNote: "PRIVATE-SENTINEL", habits: ["HABIT-SENTINEL"] }),
    };
    renderRoute(first, "/partnership", unsafe);
    expect(await screen.findByText("El apoyo está habilitado solamente mediante acciones explícitas.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("PRIVATE-SENTINEL");
    expect(document.body).not.toHaveTextContent("HABIT-SENTINEL");
  });
});
