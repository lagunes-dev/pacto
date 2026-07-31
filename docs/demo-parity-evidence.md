# Complete demo parity evidence

This record closes the local PR7 integration boundary without promoting local checks into hosted, provider, browser-service, or physical-device claims.

## Integrated contract

- Realtime starts only for an authenticated active partnership, invalidates only mapped query families, and stops on pause, end, sign-out, unmount, or dependency change.
- Push permission and subscription activation remain deliberate user actions. App open checks status but never requests permission or subscribes automatically.
- A confirmed support request makes one best-effort `send-support-push` invocation containing exactly `{ support_request_id }`. Dispatch failure does not rewrite the persisted request or trigger an automatic retry.
- The Edge Function re-authorizes the requester, pending request, active partnership, and recipient. Its payload contains only version, kind, and request ID; it never contains the selected choice, optional phrase, notes, habits, food details, endpoints, or keys.
- Offline replay admits only actor-bound recovery plans. Check-in, weekly review, support, partnership, Push, and private-note operations are rejected and never queued.
- Provider acceptance is not device delivery. The function always reports `deliveryConfirmed: false`.

## Evidence classification

| Class | Status | Evidence / exact blocker |
| --- | --- | --- |
| `local-static` | `PASS` | On the PR7 worktree based on `b395c5c`: clean install completed; typecheck passed; 29 files / 162 tests passed; production build and PWA validation passed; static SQL passed 70 assertions; production audit found 0 vulnerabilities; the reviewed audit classified the known 8 HIGH development-chain findings. |
| `local-browser` | `PASS` | 52/52 fixture-backed Playwright scenarios passed across desktop and compact Chromium, including the explicit online-only support boundary. This does not use hosted Supabase Realtime or a Push provider. |
| `runtime-sql-rls` | `SKIPPED (BLOCKED)` | No disposable hosted Supabase project, database URL, `psql`, or authorized test identities are available for this campaign. |
| `hosted-realtime` | `SKIPPED (BLOCKED)` | No authorized hosted project with the reviewed migrations/publication and two safe test identities is available. |
| `hosted-https` | `SKIPPED (BLOCKED)` | No authorized Cloudflare Pages deployment URL is available. |
| `browser-push` | `SKIPPED (BLOCKED)` | No authorized hosted HTTPS origin, deployed Edge Function, public VAPID configuration, or safe browser subscription is available. |
| `provider-acceptance` | `SKIPPED (BLOCKED)` | No authorized provider dispatch was executed; repository tests use mocks only. |
| `physical-iphone` | `SKIPPED (BLOCKED)` | No physical iPhone installation/standalone campaign was executed. |
| `device-display` | `SKIPPED (BLOCKED)` | No notification was observed on a physical device; provider acceptance, if later obtained, would still not prove display. |

## Safe hosted follow-up

Use a sanitized support request ID from two dedicated test identities. Confirm subscription activation explicitly, create one allowed support request, capture only aggregate function output, and verify narrow Realtime refetch. Never retain JWTs, account identifiers, request IDs, endpoints, keys, selected choices, phrases, or screenshots containing private data. Record hosted Realtime, browser Push, provider acceptance, physical iPhone, and device display as independent evidence classes.

## Rollback boundary

Revert the PR7 commit to remove only the support-to-Push invocation, final cleanup assertions, browser contract evidence, and this record. Existing Realtime, Push subscription, Edge Function, support lifecycle, partnership, and recovery-only replay infrastructure remains unchanged.
