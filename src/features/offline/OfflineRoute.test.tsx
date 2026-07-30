import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { appRoutes, offlinePrivateLoader } from "../../app/router";
import { AppProviders } from "../../app/providers";
import { createFixtureServices } from "../../infrastructure/fixture/services";

describe("offline routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects a private navigation before session resolution when offline", () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });

    expect(offlinePrivateLoader()).toEqual(expect.objectContaining({ status: 302 }));
  });

  it("shows the explicit offline page for an unavailable navigation", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ["/unavailable"],
    });

    render(
      <AppProviders authPort={createFixtureServices().auth}>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/offline"));
    expect(screen.getByRole("heading", { name: "You are offline" })).toBeInTheDocument();
  });
});
