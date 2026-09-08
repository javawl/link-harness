# browser/ group rules

- Each registered browser owns one lazy session and isolated login state. Tab refs are local to that browser; callers must preserve both browser id and page ref throughout an operation.
- `BrowserCommand` / `BrowserResult` are CLOSED unions owned by `dsh-browser`: providers and consumers `switch` to exhaustiveness (`assertNever`); adding a kind is a compile-enforced change across all three packages.
- Providers must not read credentials, cookies, or storage beyond what a command explicitly targets, and must never log page contents; snapshots are bounded by `maxChars`.
- `available()` is a cheap local check — it must not launch a browser.
