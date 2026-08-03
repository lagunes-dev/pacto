# Browser deployment readiness

This runbook prepares Pacto for Cloudflare Pages without treating repository checks as proof of hosted, device, or push behavior.

## Evidence contract

Record each result with this shape:

```text
class: local | ci-browser | hosted-https | physical-iphone | provider-acceptance | device-display
status: PASS | FAIL | SKIPPED (BLOCKED)
commit: immutable commit SHA
target: sanitized local, CI, Pages, browser, provider, or device identifier
checks: commands or manual steps actually completed
blockers: exact missing prerequisite, or none
sanitizedArtifacts: log, report, or screenshot references without secrets or private data
```

Evidence classes never inherit `PASS`. Local Chromium does not prove a GitHub-hosted workflow; CI Chromium does not prove Cloudflare Pages routing; hosted HTTPS does not prove physical-iPhone behavior; and provider acceptance does not prove device display.

### Readiness baseline

This baseline records the evidence available when this runbook was added. Replace it only with evidence from an actual validation campaign.

| Class | Status | Available evidence or blocker |
| --- | --- | --- |
| `local` | `PASS` | Clean install, typecheck, tests, production build, PWA validation, desktop/compact Chromium E2E, production audit, and reviewed development audit were executed locally; the apply/verify record identifies the commit and output. |
| `ci-browser` | `SKIPPED (BLOCKED)` | Workflow is statically configured, but no GitHub Actions run was executed or observed. |
| `hosted-https` | `SKIPPED (BLOCKED)` | No authorized Cloudflare Pages URL or HTTP response was available. |
| `physical-iphone` | `SKIPPED (BLOCKED)` | No physical iPhone installation, standalone launch, Safari, or safe-area campaign was executed. |
| `provider-acceptance` | `SKIPPED (BLOCKED)` | No authorized hosted push dispatch/provider response was executed for this campaign. |
| `device-display` | `SKIPPED (BLOCKED)` | No notification delivery or visible display was observed on a physical device. |

Never store connection strings, passwords, JWTs, private VAPID material, push endpoints or keys, private payloads, or identifiable account data as evidence.

## Repository gates

Use Node.js 22, matching the browser-readiness workflow. From a clean checkout:

```bash
npm ci
npm run typecheck
npm test
npm run test:sql
npm run build
npm run validate:pwa
npm run test:e2e
npm audit --omit=dev
npm run audit:check
```

`npm run test:sql` may report runtime SQL/RLS as `SKIPPED (BLOCKED)` when database prerequisites are absent. Static SQL checks do not replace runtime authorization evidence. `npm run test:e2e` uses deterministic fixture data and `vite preview`, so it is local browser evidence rather than hosted Supabase evidence.

## Configure Cloudflare Pages

1. Connect the repository and select the authorized deployment branch.
2. Set the build command to `npm ci && npm run build`.
3. Set the build output directory to `dist`.
4. Use Node.js 22 for parity with CI.
5. Add only browser-public build variables when required:

   ```text
   VITE_DATA_ADAPTER=supabase
   VITE_SUPABASE_URL=<public URL>
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   VITE_VAPID_PUBLIC_KEY=<public VAPID key>
   ```

Every `VITE_*` value is compiled into browser assets. Do not configure database URLs, test credentials, `service_role`, management tokens, `VAPID_PRIVATE_KEY`, or `VAPID_SUBJECT` with that prefix. Cloudflare builds the client; it does not apply migrations, deploy Edge Functions, or configure server-side secrets.

Keep the first Pages deployment free of host-specific SPA rewrite files. The repository's local preview fallback proves only Vite's server behavior.

## Hosted HTTPS smoke and SPA fallback decision

Run this matrix against an authorized Pages preview URL before promoting it. Use a fresh private window or direct request for each path rather than navigating from `/`.

| Check | Procedure | PASS condition |
| --- | --- | --- |
| Root | Request `/` over HTTPS. | Pages returns the application shell and public sign-in UI. |
| Supported deep link | Request `/partnership/support` directly with no prior SPA navigation. | Pages returns the shell; an unauthenticated visitor reaches sign-in rather than a host 404. |
| Generated assets | Request the emitted manifest, service worker, and every declared icon URL discovered from the deployed build. | Each intended asset returns its expected content successfully; no private response is cached. |
| Unknown route | Request a unique nonexistent path directly. | Record whether it reaches application-level route behavior or a platform 404; do not confuse an HTML shell response with a static asset response. |

Record sanitized status codes, final paths, commit, Pages deployment identifier, browser version, and timestamps. Do not record query tokens, cookies, account identifiers, private page content, or push subscription material.

### Decision

`public/_redirects` is intentionally **not present** because no Pages HTTPS fresh-deep-link host 404 has been observed. Do not add a speculative fallback.

If and only if the supported direct deep link returns a Cloudflare host 404:

1. preserve the failed `hosted-https` evidence;
2. add the minimal Pages fallback `/* /index.html 200` in a reviewed change;
3. rebuild and redeploy the same application revision;
4. rerun root, supported deep-link, generated-asset, and unknown-route checks;
5. confirm existing assets still return their real content rather than `index.html`;
6. record the new hosted result independently.

A fallback fixes host routing only. It does not prove authorization, offline private data, iPhone installation, provider acceptance, or device display.

## Physical iPhone and push follow-up

After `hosted-https` has its own `PASS`, a separate authorized campaign may validate Safari installation and standalone behavior on a physical iPhone. Record the iOS version, device class, install action, standalone launch, direct links, safe areas, update behavior, and sanitized screenshots. Until then, use `SKIPPED (BLOCKED)`.

Push validation remains two further records: `provider-acceptance` records the sanitized provider response to an authorized explicit support request; `device-display` records actual visible delivery on the intended physical device. Neither may expose endpoints, keys, JWTs, request identifiers, partnership data, habits, notes, or private payloads. Follow [Supabase deployment and security](supabase-deployment-security.md).

## Reviewed dependency audit

The reviewed development dependency inventory currently contains the two high-severity transitive findings reported by `npm audit --json` after a clean install: `brace-expansion:high` and `fast-uri:high`.

| Previously reviewed dependency | Role in this repository |
| --- | --- |
| `vite-plugin-pwa` | Direct development dependency and sole generated PWA authority. |
| `workbox-build` | Transitive service-worker build tooling. |
| `@trickfilm400/rollup-plugin-off-main-thread` | Transitive Workbox build dependency. |
| `ejs`, `filelist`, `jake` | Transitive build-template/task chain. |
| `minimatch`, `brace-expansion` | Transitive development-time path-matching chain. |

The reviewed decision is to keep the current lockfile unchanged for this phase. Production dependencies pass `npm audit --omit=dev`, while the full development audit reports the two findings listed above. `npm run audit:check` fails if the reviewed inventory changes. `npm audit fix --force` remains prohibited; future advisory changes must be reviewed against the lockfile and generated PWA artifacts before remediation.

Evaluate future remediation in an isolated reviewed change:

1. inspect proposed direct versions, the transitive graph, release notes, and the complete lockfile diff;
2. run clean install, typecheck, tests, SQL checks, production build, PWA validation, E2E, production audit, and the reviewed full-audit classifier;
3. compare before/after manifest fields, service-worker/Workbox output, icons, push handler, and public precache inventory without committing `dist`;
4. reject private/remote cache entries, a second manifest/worker authority, fixture leakage, or unexplained generated changes;
5. update the reviewed inventory and decision only when the change is understood and all gates pass.

## Rollback

Rollback Pages to the last verified commit through its deployment history. If public build configuration is wrong, use the documented fail-closed adapter rather than adding fixture data or secrets. A docs/config rollback must not alter Supabase RLS, migrations, private data, the generated PWA authority, or `reference/demo-original/`.

After rollback, rerun the hosted root, deep-link, asset, and unknown-route matrix and record a new `hosted-https` result. Keep failed and rolled-back records; do not rewrite them as `PASS`.
