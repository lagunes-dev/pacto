import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { CravingInterventionModal } from "./CravingInterventionModal";

function Harness({ onActionSelected = vi.fn() }: { onActionSelected?: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <MemoryRouter>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Antojo 4 de 5</button>
      <CravingInterventionModal open={open} onOpenChange={setOpen} triggerRef={triggerRef} onActionSelected={onActionSelected} />
    </MemoryRouter>
  );
}

describe("CravingInterventionModal", () => {
  it("traps keyboard focus and restores the craving trigger after Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Antojo 4 de 5" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "El antojo está alto" });
    const first = within(dialog).getByRole("button", { name: "Cerrar intervención" });
    const last = within(dialog).getByRole("button", { name: "Usar esta acción" });
    expect(first).toHaveFocus();

    first.focus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("hands Pedir apoyo to explicit support without sending anything", async () => {
    const user = userEvent.setup();
    const onActionSelected = vi.fn();
    render(<Harness onActionSelected={onActionSelected} />);

    await user.click(screen.getByRole("button", { name: "Antojo 4 de 5" }));
    await user.click(screen.getByRole("button", { name: /Pedir apoyo/ }));
    await user.click(screen.getByRole("button", { name: "Usar esta acción" }));

    expect(screen.getByRole("dialog", { name: "¿Qué necesitas ahora?" })).toBeInTheDocument();
    expect(screen.getByText("No se envió ninguna solicitud.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar apoyo" })).toHaveFocus();
    expect(onActionSelected).not.toHaveBeenCalled();
  });

  it("reports a selected action without claiming it was saved", async () => {
    const user = userEvent.setup();
    const onActionSelected = vi.fn();
    render(<Harness onActionSelected={onActionSelected} />);

    await user.click(screen.getByRole("button", { name: "Antojo 4 de 5" }));
    await user.click(screen.getByRole("button", { name: /Recordar por qué empecé/ }));
    await user.click(screen.getByRole("button", { name: "Usar esta acción" }));

    expect(onActionSelected).toHaveBeenCalledWith("Recordar por qué empecé");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps every action operable at a 320px viewport", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Antojo 4 de 5" }));

    const dialog = screen.getByRole("dialog", { name: "El antojo está alto" });
    expect(within(dialog).getAllByRole("button")).toHaveLength(7);
    expect(within(dialog).getByRole("button", { name: "Ahora no" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Usar esta acción" })).toBeVisible();
  });
});
