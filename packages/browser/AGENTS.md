# browser/ group rules

- The browser is a **stateful shared surface**: every command dispatch serializes through the seam's single session; never add a second concurrent session without changing the seam contract.
- `BrowserCommand` / `BrowserResult` are CLOSED unions owned by `dsh-browser`: providers and consumers `switch` to exhaustiveness (`assertNever`); adding a kind is a compile-enforced change across all three packages.
- Providers must not read credentials, cookies, or storage beyond what a command explicitly targets, and must never log page contents; snapshots are bounded by `maxChars`.
- `available()` is a cheap local check — it must not launch a browser.
