import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { AppProviders } from "../../../app/providers";
import { createFixtureServices, createFixtureStore } from "../../../infrastructure/fixture/services";
import { ProgressRoute } from "../../progress/components/ProgressRoute";
import { HabitForm } from "./HabitForm";

async function ownerServices() {
  const store = createFixtureStore();
  const services = createFixtureServices(store);
  await services.auth.register({ email: "owner@pacto.test", password: "private-password" });
  return { services, store };
}

function renderHabitForm(services: Awaited<ReturnType<typeof ownerServices>>["services"]) {
  return render(
    <MemoryRouter>
      <AppProviders authPort={services.auth} habitRepository={services.habits} progressRepository={services.progress}>
        <HabitForm />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe("private habit and progress flow", () => {
  beforeEach(() => window.history.replaceState({}, "", "/"));

  it("creates an owner-only habit with keyboard-operable controls", async () => {
    const user = userEvent.setup();
    const { services, store } = await ownerServices();
    renderHabitForm(services);

    const name = await screen.findByLabelText("Nombre");
    name.focus();
    await user.keyboard("Caminar 20 minutos");
    await user.tab();
    await user.selectOptions(screen.getByLabelText("Prioridad"), "3");
    await user.tab();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent("Hábito creado de forma privada");
    expect(store.habits).toHaveLength(1);
    expect(store.habits[0]).toMatchObject({ name: "Caminar 20 minutos", priority: 3 });
    expect(store.habits[0].ownerId).toBe((await services.auth.getSession())?.user.id);
  });

  it("associates validation errors, preserves safe input, and performs no write", async () => {
    const user = userEvent.setup();
    const { services, store } = await ownerServices();
    renderHabitForm(services);

    const name = await screen.findByLabelText("Nombre");
    await user.type(name, "   ");
    await user.click(screen.getByRole("button", { name: "Crear hábito" }));

    const error = await screen.findByText("Escribí un nombre para el hábito.");
    expect(name).toHaveAttribute("aria-describedby", error.id);
    expect(name).toHaveValue("   ");
    expect(store.habits).toHaveLength(0);
  });

  it("edits and deletes only through the owner-scoped repository", async () => {
    const user = userEvent.setup();
    const { services, store } = await ownerServices();
    await services.habits.create({ name: "Leer", priority: 1 });
    renderHabitForm(services);

    await user.click(await screen.findByRole("button", { name: "Editar Leer" }));
    const name = screen.getByLabelText("Nombre");
    await user.clear(name);
    await user.type(name, "Leer diez páginas");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("heading", { name: "Leer diez páginas" })).toBeInTheDocument();
    expect(store.habits[0].name).toBe("Leer diez páginas");

    await user.click(screen.getByRole("button", { name: "Eliminar Leer diez páginas" }));
    await waitFor(() => expect(store.habits).toHaveLength(0));
    expect(await screen.findByText(/Todavía no creaste hábitos/)).toBeInTheDocument();
  });

  it("shows an honest unavailable error and preserves entered values", async () => {
    const user = userEvent.setup();
    const { services } = await ownerServices();
    const unavailable = { ...services.habits, create: async () => { throw new Error("Servicio temporalmente no disponible."); } };
    render(
      <MemoryRouter><AppProviders authPort={services.auth} habitRepository={unavailable} progressRepository={services.progress}><HabitForm /></AppProviders></MemoryRouter>,
    );

    const name = await screen.findByLabelText("Nombre");
    await user.type(name, "Respirar");
    await user.click(screen.getByRole("button", { name: "Crear hábito" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se guardaron cambios");
    expect(name).toHaveValue("Respirar");
  });

  it("does not fabricate progress when no persisted activity exists", async () => {
    const { services } = await ownerServices();
    render(
      <MemoryRouter><AppProviders authPort={services.auth} habitRepository={services.habits} progressRepository={services.progress}><ProgressRoute /></AppProviders></MemoryRouter>,
    );

    expect(await screen.findByText("No hay actividad persistida ni métricas para mostrar todavía.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Resumen de progreso")).not.toBeInTheDocument();
  });

  it("retries a failed personal progress request", async () => {
    const user = userEvent.setup();
    const { services } = await ownerServices();
    let attempts = 0;
    const progress = {
      getMine: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("Servicio temporalmente no disponible.");
        return { habits: [], completedEntryCount: 0, activeDayCount: 0 };
      },
    };
    render(
      <MemoryRouter><AppProviders authPort={services.auth} habitRepository={services.habits} progressRepository={progress}><ProgressRoute /></AppProviders></MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("No mostramos datos sin confirmar");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay actividad persistida ni métricas para mostrar todavía.")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
