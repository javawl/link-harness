# backlinks/ group rules

- `BacklinkItemResult` is a CLOSED union owned by `dsh-backlinks`: providers and consumers `switch` to exhaustiveness; adding a status is a compile-enforced change and a backend contract change together.
- Provider tokens are credentials: config carries the reference or the env fallback (`SUPERMANAGER_TOKEN` / `CLOUDMAIL_TOKEN`) resolves it; never log token values or full request bodies.
- HTTP providers map every non-2xx onto the `BacklinksError` taxonomy and preserve `Retry-After` as `retryAfterSeconds`; a lease conflict must never be auto-retried below the advised wait.
- `available()` is a cheap local check (configured base URL + token presence) — it must not make network calls.
- Never widen the tool schema with provider-specific knobs; backend-specific behavior stays behind the seam.
