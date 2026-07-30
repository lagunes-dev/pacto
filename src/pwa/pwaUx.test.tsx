import { readFileSync } from "node:fs";

import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import html from "../../index.html?raw";
import { AppShell } from "../shared/ui/AppShell";
import { InstallGuidance } from "./InstallGuidance";
import { useConnectivity } from "./useConnectivity";

vi.mock("../features/auth/queries/AuthProvider", () => ({
  useAuth: () => ({ session: null }),
}));

describe("iPhone PWA experience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("declares Apple install metadata and every safe-area edge", () => {
    const css = readFileSync("src/styles/globals.css", "utf8");

    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain("/icons/apple-touch-icon.png");
    for (const edge of ["top", "right", "bottom", "left"]) {
      expect(css).toContain(`env(safe-area-inset-${edge}`);
    }
  });

  it("reacts to connectivity changes", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useConnectivity());

    expect(result.current).toBe(true);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });

  it("shows truthful, accessible status and install guidance in the app shell", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(
      <MemoryRouter>
        <AppShell><p>Contenido</p></AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Estado de conexión")).toHaveTextContent("Sin conexión");
    expect(screen.getByLabelText("Estado de conexión")).toHaveTextContent("no se guardan para enviar después");
    expect(screen.getByText("Instalar")).toBeInTheDocument();
  });

  it("provides iPhone-specific installation steps without claiming installation", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "iPhone", onLine: true });
    render(<InstallGuidance />);

    expect(screen.getByText(/Compartir/)).toHaveTextContent("Agregar a inicio");
  });
});
