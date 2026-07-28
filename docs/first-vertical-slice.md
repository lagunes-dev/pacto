# First vertical slice

## Current route boundaries

- `/sign-in` and `/register` expose the development authentication boundary.
- `/habits/new` requires a resolved session and provides owner-private habit creation, listing, editing, and deletion.
- `/progress` requires the same session and displays only persisted progress returned for that owner.
- Opening a private route without a session redirects to `/sign-in`.

The application creates authentication, habit, and progress ports as one service bundle. This keeps fixture ownership coherent and lets route-level tests replace the complete bundle without domain components depending on infrastructure.

## Development fixture

`VITE_DATA_ADAPTER=fixture` is development-only. Its users, habits, and progress live in memory and disappear after a reload. It demonstrates the frontend contract but does not prove durable authentication, database persistence, authorization, or synchronization.

When no implemented data adapter is available, data-dependent actions show a recoverable unavailable state. The UI preserves safe form values and does not claim that failed changes were saved.

## Adapter replacement path

A future adapter must implement `AuthPort`, `HabitRepository`, and `ProgressRepository` without changing feature components. Ownership comes from the authenticated session; habit forms and repository inputs never accept an `ownerId` or private notes.

Before enabling a Supabase adapter, add reviewed migrations and deny-by-default RLS policies, then execute anonymous and cross-user policy tests against a real local or credentialed project. Browser code may use only a publishable key; service-role credentials are forbidden.

## Explicitly deferred and unverified

- Supabase Auth, Postgres persistence, migrations, RLS, and policy validation.
- Browser automation, visual regression, and assistive-technology validation. No browser runner is configured yet; `tests/e2e/private-habit-flow.spec.ts` remains pending until one is added.
- PWA installability, service-worker caching, offline writes, and synchronization.
- Partner linking, shared data, Realtime, push notifications, offline queues, and deployment.

Current automated evidence is Vitest/jsdom integration coverage plus the TypeScript/Vite production build. It MUST NOT be represented as browser, Supabase, or RLS evidence.
