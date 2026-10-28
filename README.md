# WalletFreak

Four focused plugins for Codex and Claude Code: Travel, Credit Cards, Spending and Shopping, with one private local workspace. Plan with flexible dates, compare 31 provider groups, evaluate existing card benefits and lounges, and explore findings in a private local dashboard. Users sign in and book themselves.

## Install

Prerequisites: Python 3.10+, Node.js 18+ and Chrome.

```sh
codex plugin marketplace add walletfreak/walletfreak_marketplace
codex plugin add walletfreak@walletfreak
codex plugin add walletfreak-credit-cards@walletfreak
codex plugin add walletfreak-spending@walletfreak
codex plugin add walletfreak-shopping@walletfreak

# Or Claude Code:
claude plugin marketplace add walletfreak/walletfreak_marketplace
claude plugin install walletfreak@walletfreak
claude plugin install walletfreak-credit-cards@walletfreak
claude plugin install walletfreak-spending@walletfreak
claude plugin install walletfreak-shopping@walletfreak
```

Start a fresh host session and ask: **Use walletfreak-setup to open my local dashboard.**

WalletFreak Travel covers all 31 travel providers, trip planning and the shared local server. Credit Cards supplies traveler-profile, card-travel-benefits, wallet-optimizer and wallet-sync. Both use the same saved wallet. Spending and Shopping add their own research skills. See [installation and migration](docs/INSTALL.md).

## Four research views

WalletFreak Spending adds the spending-analysis skill and bank-specific guides for Chase, Citi, Capital One, Amex and other mapped CSVs. It uses the same core local dashboard—no second server. Drop downloaded PDF, CSV or ZIP statements into Spending. Files are saved as local references; ask your agent for metrics, categories or recurring charges, and explore the sourced results in the dashboard. The optional CSV spreadsheet provides category review and transaction/monthly exports. Every row needs review before inclusion. Payments/transfers are excluded from spending; currencies stay separate. PDF extraction is a local assisted workflow, not an automatic transaction parser.

**Your files are processed on your device. No bank credentials required.** Direct import, categorization and exports run locally. The ledger is a private local plaintext file. Content you ask an agent to read may be processed by your host/model provider; this is not an offline language model.

## Compose your dashboard

Travel uses the bundled Concierge template for every saved trip. The public component gallery shows design references; its layout JSON does not change the local dashboard. Use dashboard-builder when you explicitly want to change bundled components or styling. The plugin bundles catalog v1 and the renderer for offline use. Layouts contain component IDs and local data bindings, never financial data, URLs or executable code.

The website publishes the same catalog, schema and renderer at /components/v1/ and previews templates at /components.html. A separate read-only catalog MCP prototype lives in the website repository; deploying it is optional, and the local plugin needs no hosted service.

## Plan a trip

“NYC to Tokyo and Kyoto for two adults in April, 7–10 nights, departure flexible by three days. Economy with at most one stop, hotels near transit, USD 4,000 total. Compare cash and my Chase/Amex points. Show my local trip board.”

Keep planning and follow-up questions in your host conversation. The local browser shows the resulting itinerary, flights, stays and findings. Personal wallet lets you enter cards, loyalty programs, points/miles, status, credits and certificates for optional reuse. It does not run or communicate with an agent.

The dashboard offers searchable findings, persistent shortlists, side-by-side comparisons, selected itinerary costs, dated evidence and sanitized HTML export. Different currencies and points programs remain separate; unknown fees are never zero. Examples are fictional and labeled.

## Choose the best card or redemption

Ask: “Use my wallet to choose the best card or points redemption for this booking. Compare current offers, total cash due and the points I would spend. Tell me what would change the recommendation.” The wallet-optimizer skill compares existing cards and currencies using current official terms and feasible quotes, including cash-versus-points, transfer bonuses, usable credits and earning opportunity costs.

## Accounts

When sign-in is needed during research, the agent opens the official provider page. Enter credentials and MFA codes there. Temporary sessions are default; remembering sign-ins is opt-in and applies after restarting the host's browser connection. Saved sessions stay in a dedicated local profile outside the repositories. One host owns it at a time. Forget-all removes local sessions on the next browser connection start; it does not revoke provider-side sessions.

Wallet → Connected accounts stores passwords encrypted in private local JSON and initializes automatically on first use. The encryption key is held by the device (macOS Keychain on Mac), without a separate WalletFreak master password. Older master-password sign-ins can migrate after one unlock. Ask wallet-sync to refresh a selected person’s rewards accounts; the browser bridge fills saved credentials only on their exact approved login origin, without returning secrets to the agent. MFA remains user-operated. No SMS reader, bookings, cancellations, enrollments or transfers. These are workflow restrictions, not a technical transaction firewall. See [privacy](docs/PRIVACY.md).

## Coverage and verification

Eight hotel groups, 19 airline/program groups and four card travel portals share one research contract and keep individual provider references. The [catalog](providers.json) contains aliases, legacy skill names and guide paths. [Verification evidence](docs/provider-verification.json) stays provider-specific; authored guides do not establish live inventory access. Unknown providers can be researched generically with that limit disclosed.

## Develop

```sh
python3 -m unittest discover -s tests -v
claude plugin validate .
python3 plugins/walletfreak/scripts/local.py start
```

For a separate test data directory, set WALLETFREAK_DATA to a dedicated private directory. Normal data lives in ~/.walletfreak/local: results.json, wallet.json and layout.json are independent files. Delete individual results or your wallet in the viewer, or remove the corresponding file. Downloaded trip files are separate and exclude wallet data. The legacy optional Markdown profile remains ~/.walletfreak/traveler-profile.md. Never commit real trip or account data.

[Acceptance](docs/ACCEPTANCE.md) · [Validation](docs/VALIDATION.md) · [Contributing](CONTRIBUTING.md).

The separate walletfreak repository owns the public website. Source publication and website deployment are separate release actions. MIT applies to code; provider artwork retains its source/trademark notices.

The wallet groups cards, rewards accounts and assets by person, retaining a Table view for bulk edits. Stable links keep shared rewards balances on one account. The v2 migration preserves existing values and saves wallet-v1-backup.json locally; deleting the personal wallet also deletes that backup. Travel templates show a compact timeline and route list. Street-map tiles are optional and contact OpenStreetMap only after Load street map. Exports retain an offline route list.

WalletFreak Shopping researches current merchant prices, cash back and card choices, and publishes sourced offers to the same local Shopping board. Give flight or hotel confirmation details to your agent for review and a visual itinerary. The Travel page does not have an email paste form. Your agent can sync upcoming trips from a connected provider during an active conversation, with you completing any provider verification.
