# Credit Cards 0.5 — Individual card families

- Add exact-product U.S. guides and aliases, with separate personal/business and existing-card variants.
- Route benefits, earning/payment comparisons and requested credit checks to only the relevant product guides.
- Publish validated families incrementally; see the Credit Cards README and Git history for current coverage.

# 0.5.0 — Skills and manual browser login

- Remove the local dashboard, layouts, credential vault/bridge and startup hooks. Existing private data is retained.
- Research in conversation; users log in directly in temporary Chrome sessions.
- Add Hertz points/cash research and scoped search combinations.
- Keep optional profile files and standalone reviewed CSV spending tools.

# Changelog

## Guided wallets and ZIP references

- Four-step wallet setup, direct entry saves, labeled rewards accounts and optional linked sign-ins.
- One-trip Overview with agent starter prompts and refreshed dashboard-generation instructions.
- ZIP reference inventories, bounded agent extraction, source provenance and cascade deletion.
- Shared component release 1.2.0 and matching responsive public previews.

## Local follow-up — statement references and agent metrics

- Make Spending a PDF/CSV drop area with private local references and agent-published, sourced metrics. Keep the transaction spreadsheet optional.
- Show only enabled WalletFreak packages in Plugins & Skills.
- Add a compact public workspace demo and collapse detailed travel catalogs on the website.

## Local follow-up — spending and compact workspace

- Add WalletFreak Spending with bank-specific CSV/PDF guidance and spending-analysis, sharing the existing core server.
- Add local CSV preview, column mapping, editable categories/types/review states, monthly currency-separated totals, overlap detection and formula-safe CSV downloads.
- Add compact wallet tables, legacy profile import, gift cards/travel funds, encrypted browser-only sign-ins and installed-skill browsing.
- Add per-purchase payment cards and planned/used/conditional benefit status to interactive and exported itineraries.
- Update branding to all-in-one plugins + skills with accurate local-processing privacy copy. No automatic login, SMS reader or universal PDF transaction parser.

## Local follow-up — wallet optimizer

- Add wallet-optimizer to the existing plugin: choose an existing payment card and current redemption route using actual quotes, point opportunity costs, transfer offers and usable benefits.
- Keep recommendations tied to ownership, preservation preferences and current official evidence; display the recommendation in the existing trip results.


## Local follow-up — results viewer and personal wallet

- Keep planning and agent interaction in the host conversation; remove dashboard intake, request queues and account-connect controls.
- Publish revision-checked findings directly, with immediately visible flight/stay/activity itinerary components and independent result deletion.
- Add editable local cards, loyalty balances, status, credits/certificates and preferences, with historical card art and conflict-safe saves.
- Keep wallet data separate from results and exports; preserve old findings/selections during one-time migration.


## 0.3.0 — one plugin and a local travel desk

- Consolidate all five packages into `walletfreak`: seven skills and 31 provider references, with program and legacy command aliases preserved.
- Add guided trip intake, saved brief revisions, an explicit agent request queue, searchable findings, persistent shortlists, selected itinerary costs and standalone export.
- Add a loopback-only dashboard with separate browser/agent authentication, origin checks, private atomic storage and resumable request leases.
- Add account connections through the sole browser, temporary sessions by default, opt-in remembered sessions and explicit forget-all on restart. Passwords and verification codes stay on provider pages.
- Restore the original blue-wallet mascot and bundle sourced provider logos. The accompanying website restores historical card artwork, simplifies installation and includes a fictional interactive example.
- Preserve optional traveler profiles and existing calculator, card-benefit and lounge guidance. Publish migration instructions; source changes do not delete private data.


## Local follow-up — startup balances and trip board

- Confirm self-reported balances once at the start of each travel session, including provider-first entry; reuse facts on handoffs.
- Add `walletfreak-trip-board`: portable visual options, evidence, availability, shortlist and proposed itinerary, with no automatic publication or wallet export.

## 0.2.0 — category packages

- Prioritize a card-based lounge-access tracker with traveler/guest eligibility, terminal feasibility, fees and planned/used visit ledgers.
- Make award cash charges and already-applied mileage discounts explicit, with dated Delta/United official-source guidance.

- Replace 31 individual provider packages with `walletfreak-hotels`, `walletfreak-flights` and `walletfreak-credit-cards`; preserve all 31 provider skills and their bundled guides.
- Move `card-travel-benefits` from core to the credit-cards category alongside the four portal skills; core retains planning, setup and the sole browser.
- Add category selection to the website, public GitHub marketplace links, provider-to-category metadata and 0.1.0 migration instructions.
- Keep provider evidence separate by provider ID and distinguish historical 0.1.0 checks from 0.2.0 results in `docs/VALIDATION.md`.

## 0.1.0 — initial provider packages

- Core card-travel-benefits skill for Hilton Aspire/Surpass and other hotel/flight cards, with shared-allowance checks and provider routing.
- Shared travel core, setup diagnostics and one pinned local Playwright MCP connection.
- 31 independently installable hotel, airline/program and card-portal plugins.
- Codex and Claude catalogs referencing the same self-contained plugin directories.
- Sourced result contract, checked redemption arithmetic and explicit privacy/transaction boundaries.
- Installation, contributor, acceptance and provider-verification documentation.

Release readiness depends on the actual results in `docs/VALIDATION.md`. Provider guidance is authored; authenticated inventory and eligibility are not certified.
