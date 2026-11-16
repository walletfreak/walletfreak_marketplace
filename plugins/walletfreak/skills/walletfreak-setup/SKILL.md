---
name: walletfreak-setup
description: "Diagnose WalletFreak skill discovery and its shared Chrome browser in Codex or Claude Code."
---

# Setup

Check Node.js 18+, npx and Chrome. Python 3 is needed only for the optional redemption calculator and spending helpers. Core provides travel planning, provider research, Hertz research, lounges, confirmation review and stay routes. Credit Cards, Spending and Shopping are optional packages.

Use the host's discovered `walletfreak-browser` MCP connection. The bundled configuration runs pinned Playwright MCP with headed Chrome, `--isolated`, stdout output and code generation disabled. Providers share this connection and its tabs; do not race browser calls on one page. Each host gets a separate temporary profile. No local dashboard, credential file, vault or account setup is required.

If skills or tools are missing, give the relevant host command: `codex plugin add walletfreak@walletfreak` or `claude plugin install walletfreak@walletfreak`. If necessary first add marketplace `walletfreak/walletfreak_marketplace` with the host's `plugin marketplace add` command. Restart the host session after an install/update. Do not start another browser server or attach a personal Chrome profile to repair discovery. Report actual launch errors; check Chrome, npx downloads and host permissions.

Read [browser and login guidance](../travel-plan/references/browser.md) before opening a public page to verify connectivity. When login is needed, open the official sign-in page, notify the user to log in in Chrome, and wait for their confirmation. Verify a non-sensitive signed-in view before continuing. Never request or read passwords or verification codes.

Report which skills/tools were discovered and what was actually tested. Setup does not start travel research, financial intake or an account refresh. Upgrading leaves old private data untouched; the removed dashboard and saved-sign-in bridge are no longer used.
