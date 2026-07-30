# Demo parity — Slice 1

Slice 1 is complete. It establishes the authenticated parity shell while keeping every unsupported demo workflow explicit and unavailable.

## Delivered

- Canonical authenticated routes: `/inicio`, `/registro`, `/progreso`, and `/acuerdo`.
- The same four-item navigation on desktop and mobile, with URL-driven titles and one active item per navigation.
- Reference-aligned sage/cream Inicio cards, responsive shell, safe-area bottom navigation, and controls with at least 44px targets.
- A consent-first setup dialog with keyboard dismissal and trigger-focus restoration. It does not create invitations, connections, or writes.
- One polite status toast with replacement and five-second dismissal behavior.
- Topbar profile, notification-status, connectivity, and capability-based install guidance controls.
- Truthful offline copy: private actions require connectivity and are not queued for later replay.

## Security and data boundaries

Authentication remains required for every canonical route. Production data continues through the existing Supabase adapters and RLS policies; the shell does not accept client-provided ownership or expose service-role credentials. Missing production configuration fails closed instead of falling back to fixtures.

Fixture data is limited to development and browser tests. It is not evidence of production persistence, authorization, sharing, or hosted RLS execution.

## Deferred to later slices

- Check-in behavior and persistence.
- Recovery and private notes.
- Craving-triggered intervention and support workflows.
- Agreement controls and partnership parity.
- Full progress parity.
- Offline replay and reconciliation.

## Feature-branch chain and rollback

| Child | Boundary | Rollback |
|---|---|---|
| PR1 (`bd9d627`) | Canonical routes, Inicio/Registro boundaries, and shared navigation descriptors | Revert PR1 to restore the earlier authenticated routes and shell. |
| PR2 (`0b819aa`) | Toast/modal primitives, setup shell, and truthful topbar controls | Revert PR2 while retaining PR1 navigation and routes. |
| PR3 | Responsive parity styling, Playwright evidence, and this completion record | Revert PR3 while retaining the functional PR1/PR2 shell. |

`reference/demo-original/` is an immutable visual and interaction reference. Slice 1 does not modify it or claim completion of the deferred workflows above.
