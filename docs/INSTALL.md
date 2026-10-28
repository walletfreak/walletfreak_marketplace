# Installation and upgrading

Requires Python 3.10+, Node.js 18+ and Chrome. Both hosts can install four focused packages; Travel owns the one local dashboard and browser MCP connection.

## Fresh install

Codex: `codex plugin marketplace add walletfreak/walletfreak_marketplace`, then `codex plugin add walletfreak@walletfreak`.

Claude Code: `claude plugin marketplace add walletfreak/walletfreak_marketplace`, then `claude plugin install walletfreak@walletfreak`.

Start a fresh host session and invoke walletfreak-setup. Codex exposes the packaged onboarding skill after installation; Claude Code offers it in a new session. The private dashboard starts with the Concierge travel design shown on the website; first-run setup offers wallet details and optional connected accounts. Saved trips fill the fixed Travel template. For an unpublished development build, add the explicit marketplace checkout path instead of the GitHub source. Verify which source the host is using before reinstalling.

## Upgrade from 0.1 or 0.2

1. Retain existing trip files and ~/.walletfreak/traveler-profile.md. The revised viewer migrates old dashboard findings and selections once into results.json; obsolete intake/request/account controls are removed. The optional Markdown profile is unchanged.
2. Stop an already-running dashboard before updating; saved records remain. Update the marketplace and install the current walletfreak package. Verify the Travel skills and shared server, then install the current walletfreak-credit-cards package if card research is wanted.
3. Remove previously installed legacy category plugins walletfreak-hotels, walletfreak-flights and walletfreak-trip-board. Replace a 0.2 walletfreak-credit-cards installation with the current package after verifying the new skills. Codex uses `codex plugin remove <name>@walletfreak`; Claude uses `claude plugin uninstall <name>@walletfreak`. Remove 0.1 individual provider plugins too if still installed.
4. Close the old host session and start a fresh one. Verify exactly one walletfreak-browser connection.
5. Old provider commands such as united-research map to provider-research and the united reference. Every old skill name remains in the provider catalog's legacySkill field.

Plugin removal should remove installed package code only, not the private WalletFreak data directory. Do not delete a personal profile to resolve package discovery.

## Local dashboard

Resolve the installed plugin path from walletfreak-setup, then run `python3 <plugin>/scripts/local.py start`. It reuses an existing healthy service or chooses an available port and prints a private loopback URL. Keep the fragment access key private. No cloud account or API key is required.

Plan in the host conversation. The agent publishes findings to Travel → Saved trips, where you can explore itinerary components, compare options, download a standalone trip file or delete results. Personal wallet separately saves cards, loyalty balances, status, credits and certificates. `local.py stop` stops the service without deleting saved data.

WALLETFREAK_DATA can point to a dedicated private directory for tests or another local user-selected location. Keep it consistent between the dashboard and host browser process. Default: ~/.walletfreak/local. Never use a repository, home directory itself, shared folder or installed plugin directory.

## Compact wallet and optional encrypted sign-ins

The viewer starts on Travel. Open Wallet to add cards, loyalty accounts and optional encrypted provider sign-ins. A new wallet starts with one personal profile; older multi-person wallets remain readable. Pick a common loyalty program from the bundled provider list or choose Other program. Enter balances manually if preferred. If an older traveler-profile.md exists beside the local data directory, Load existing wallet imports it into an empty wallet without changing the original. Import is explicit and does not silently refresh old reporting dates. Add separate rows for gift cards, TravelBank, airline credits, certificates, passes and other assets; blank values remain unknown.

To connect an account, open Wallet → Connected accounts and choose hotel, airline or card portal, then its provider, then enter your login details in the private browser. Ask your agent in the active conversation to sync upcoming trips or refresh a balance. The agent opens the approved provider site and may ask you to complete verification; the dashboard does not initiate a background login. Wallet keeps passwords encrypted in private local JSON. The optional dependency is `python3 -m pip install -r <plugin>/requirements-vault.txt` in the Python environment used to run local.py; use an isolated environment if required by your Python installation. The wallet and results viewer require no additional package. Never enter secrets in shell arguments or chat. New storage initializes automatically with a device-held key. Older master-password sign-ins can migrate after one unlock. Saving a sign-in does not automatically log in.

Plugins & skills displays local Codex installations and their skill documents. If the native CLI is unavailable it shows this bundled WalletFreak package with an explicit discovery limitation. Restart the viewer after installing/removing plugins to refresh its inventory.

## Browser sessions

Temporary mode is default. Ask the setup skill to remember sign-ins or forget saved sessions; it updates the local setting only at your request. Mode changes apply on the first browser action after the next MCP connection start. Fully close/restart the host's WalletFreak connection after changing it; browser_close alone does not restart the wrapper.

The wrapper prevents concurrent hosts from sharing a profile. Tool discovery remains available without a lock. The first browser action acquires ownership until that host connection closes; close the other connection if locked. Never delete lock files or connect a personal browser. Sign in on the provider's official page; handle MFA/CAPTCHA directly. A prior sign-in is not a guarantee that a session remains valid.

Forget all local sessions schedules removal of the dedicated saved profile when the restarted connection first uses the browser, after checking exclusive ownership. Close any remaining dedicated Chrome window first. It preserves trips and the optional traveler profile; provider-side sessions are not revoked.

If starting fails, run `local.py serve` in a terminal for the error. Preserve data on failures; do not reset settings to hide corruption. Port conflicts do not require killing other applications.

## Credit Cards, Spending and Shopping plugins

Install walletfreak-credit-cards@walletfreak, walletfreak-spending@walletfreak and/or walletfreak-shopping@walletfreak with the same host plugin command after installing WalletFreak Travel. Start a new thread and ask for spending-analysis. All use the same dashboard. The CSV importer has no third-party dependencies. PDF text extraction optionally uses an already-installed pdftotext; scanned/unusual PDFs need local conversion and reconciliation. No automatic PDF transaction import or XLSX export is claimed.

Shopping researches live merchant offers and publishes sourced deals to the shared local Shopping board. Give confirmation text to the agent in conversation for reviewed itinerary import; the Travel page has no email paste form.

## Upgrade from Finance

The package ID is now `walletfreak-spending`. Install it, start a new host session, verify the Spending tab still shows your saved references and ledger, then remove `walletfreak-finance`. Do not delete `~/.walletfreak/local`; the server keeps the same data files and does not migrate or reset them.
