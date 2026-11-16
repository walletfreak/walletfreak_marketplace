# WalletFreak

Focused research skills for Codex and Claude Code. Compare flights, hotels, Hertz rentals, cash and points; evaluate existing cards; analyze downloaded statements; and research shopping offers. Results appear in your conversation. No dashboard, account setup or credential file is required.

## Install

Travel/browser research needs Node.js 18+, npx and Chrome. Python 3 is needed only for the optional redemption calculator and spending helpers.

```sh
# Codex
codex plugin marketplace add walletfreak/walletfreak_marketplace
codex plugin add walletfreak@walletfreak

# Or Claude Code
claude plugin marketplace add walletfreak/walletfreak_marketplace
claude plugin install walletfreak@walletfreak
```

Start a fresh host session and ask for your research. Use `walletfreak-setup` if skills or browser tools are missing. Add only optional packages you want using the same host command: `walletfreak-credit-cards@walletfreak`, `walletfreak-spending@walletfreak`, or `walletfreak-shopping@walletfreak`.

| Plugin | Skills |
| --- | --- |
| WalletFreak Travel | travel-plan, provider-research, hertz-research, lounge-access, confirmation-import, stay-route-map, walletfreak-setup |
| Credit Cards | traveler-profile, card-travel-benefits, wallet-optimizer, wallet-sync |
| Spending | spending-analysis, with standalone CSV review/export and PDF text extraction helpers |
| Shopping | deal-research |

Travel supplies the shared browser for authenticated research in the other packages. Spending works independently with downloaded files. See [installation and migration](docs/INSTALL.md).

## Manual Chrome login

When an account is needed, the agent opens the official provider page and notifies you to log in in Chrome. Enter your username/password and complete verification there, then tell the agent you are done. It verifies a non-sensitive signed-in view before resuming in the same session. Never paste passwords or MFA codes into the conversation.

Each host uses its own temporary isolated browser profile. WalletFreak does not save credentials, read a password config, or offer remembered sessions. Closing the browser ends that session. Existing private data from older releases is left untouched and is no longer read by the removed dashboard/credential bridge. See [privacy](docs/PRIVACY.md).

## Research

Travel covers eight hotel groups, 19 airline/program groups, four card travel portals and Hertz. Provider references load only when relevant. The [catalog](providers.json) records routing and legacy aliases; [verification evidence](docs/provider-verification.json) distinguishes authored guidance from actual live testing.

Ask for dates, locations and preferences in ordinary language. The agent asks only for material gaps, searches useful combinations, and returns equivalent quotes, mandatory fees, restrictions, observation times, sources and reproducible booking steps. Unknown fees remain unknown. Optional balances/cards can stay in chat; saving a non-secret traveler profile is explicitly optional.

Hertz research compares scoped pickup/drop-off locations, dates/times, vehicle classes, eligible discount codes and cash versus points. Exact redemption costs are verified only if accessible without checkout or a hold; otherwise the agent requests redacted user-supplied evidence or labels them unverified. Users make all reservations and transactions themselves.

Redemption value is `(equivalent cash avoided - mandatory award cash charges) / final points spent`, with currencies and assumptions explicit. Card credits and future rewards remain separate from cash due. The agent does not fill checkout, hold inventory, purchase, cancel, enroll or transfer points. These are workflow instructions, not a technical transaction firewall.

Spending uses requested local statements/CSVs, not bank credentials. Its optional ledger retains duplicate review, revision checks, decimal totals, currency separation and safe CSV exports. Agent-assisted interpretation follows your host/model provider's data handling. Shopping returns current sourced offers in conversation. Files are exported only when requested.

## Develop

```sh
python3 -m unittest discover -s tests -v
claude plugin validate .
# Optional real-Chrome check using a synthetic local page, no provider account:
python3 tests/browser-mcp-smoke.py
```

[Acceptance](docs/ACCEPTANCE.md) · [Validation](docs/VALIDATION.md) · [Contributing](CONTRIBUTING.md).

This repository owns skills, catalogs and documentation. The separate [website repository](https://github.com/walletfreak/walletfreak) owns the public GitHub landing page and existing Firebase Hosting configuration. Git publication and website deployment are separate actions. MIT licensed; independent of providers and agent vendors.
