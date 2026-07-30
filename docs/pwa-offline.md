# PWA installation and offline boundaries

Pacto provides an installable public application shell. Installation does not make authenticated data or private actions available offline.

## Install

### iPhone or iPad

1. Open Pacto in Safari over HTTPS.
2. Choose **Share**.
3. Choose **Add to Home Screen**, then confirm.

### Other supported browsers

Use the browser's **Install** action when it is offered. Browser support and wording vary.

## Updates

The browser can download a generated service-worker update in the background, but this release does not show an in-app update prompt. The update waits while an existing Pacto tab controls the app; finish important work, close every Pacto tab, and reopen the app to let the browser activate it.

## Offline limits

- The generated worker caches only emitted public HTML, JavaScript, CSS, and declared icon assets.
- Authenticated views, Supabase responses, tokens, and arbitrary network responses are not cached.
- The interface reports connectivity changes. Private actions require a connection.
- Operations are not queued, replayed, or sent later by this release.

## Browser and device evidence

Automated tests validate metadata, generated public assets, connectivity messaging, safe-area declarations, and desktop/compact Chromium behavior against a production-format fixture build. Evidence is classified independently as `local`, `ci-browser`, `hosted-https`, `physical-iphone`, `provider-acceptance`, or `device-display`. Valid statuses are `PASS`, `FAIL`, and `SKIPPED (BLOCKED)`; one class never grants `PASS` to another.

Real installability, standalone launch, update behavior, and notched-device layout still require:

- a deployed HTTPS build,
- a supported desktop browser with PWA inspection tools, and
- a physical iPhone or iPad running Safari.

Those prerequisites are not available in the repository test environment, so this document does **not** claim hosted HTTPS, Safari, physical-iPhone, provider, delivery, or device-display validation. Follow the [browser deployment runbook](browser-deployment.md) for Cloudflare Pages settings, SPA fallback decisions, sanitized evidence, and blockers.
