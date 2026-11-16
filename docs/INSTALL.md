# Installation and upgrades

Use a host with plugin support. Travel research requires Node.js 18+, npx and Chrome; optional arithmetic/spending helpers require Python 3. No paid API, dashboard service, credential config or cryptography package is required.

## Codex

```sh
codex plugin marketplace add walletfreak/walletfreak_marketplace
codex plugin add walletfreak@walletfreak
```

Optional packages use `codex plugin add <name>@walletfreak`: walletfreak-credit-cards, walletfreak-spending, walletfreak-shopping.

## Claude Code

```sh
claude plugin marketplace add walletfreak/walletfreak_marketplace
claude plugin install walletfreak@walletfreak
```

Optional packages use `claude plugin install <name>@walletfreak` with the same names. For local development, register this checkout's absolute path instead of the GitHub marketplace source. Start a new host session after installation/update. Ask `walletfreak-setup` to check discovery only if needed.

## Browser and login

Core's .mcp.json supplies one pinned Playwright MCP browser with headed Chrome, isolated temporary profiles, stdout output and no code generation. Providers reuse that connection. Each host has its own isolated session; do not run concurrent actions on one tab. npx may need network access on first launch.

When login is required, the agent opens the official provider page, tells you to log in directly and waits for confirmation. Enter credentials and MFA/CAPTCHA only there. After you confirm, the agent verifies a non-sensitive authenticated view and resumes. Expiry requires another manual login. Never configure username/password files or attach your personal Chrome profile.

## Upgrade to 0.5

Update the installed packages through the host's plugin manager, then restart the host so old skills, startup hooks and browser tools are unloaded. Core 0.5.0, Credit Cards 0.4.0, Spending 0.2.0 and Shopping 0.2.0 remove dashboard dependencies. Do not edit installed plugin caches manually.

The dashboard, trip-board, dashboard-builder, credential vault/bridge, remembered-session settings and dashboard startup hook are removed. Existing ~/.walletfreak/local data, credential files, device keys and browser profiles are not migrated, read or deleted by the new browser configuration. Close an old dashboard process/window you still have open. Removing code does not revoke provider-side sessions or erase old data. Keep backups and remove old data only by a separate explicit cleanup decision.

The optional ~/.walletfreak/traveler-profile.md remains a plain-text, non-secret profile. For an old structured wallet/result file, explicitly ask the agent to review only that named non-secret file if you want a sanitized export; do not ask it to read credential/key files. Spending's standalone helper retains the spending.json format and WALLETFREAK_DATA location, so an existing requested ledger remains usable. Old source downloads/exports remain independent.

Pre-unified category installs can be replaced with current Travel and optional Credit Cards through the host's plugin manager. Legacy provider skill names resolve through providers.json. Missing categories do not require a dependency manager.

## Troubleshooting

Check discovered skills and walletfreak-browser tools, Chrome availability, npx downloads and host permissions. Report actual errors. Do not launch a second server or delete unrelated profiles/locks. If a provider blocks automation, accept redacted manually supplied results and label them unverified. No installation check proves live authenticated provider access.
