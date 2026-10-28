# Release acceptance

- Two focused plugins in both host catalogs; eight core skills plus spending-analysis; 31 provider references and evidence records preserved.
- Fresh installation and upgrade documentation for both hosts; old category plugins do not remain enabled alongside the unified package.
- One pinned browser MCP connection with temporary default, opt-in saved profile and exclusive ownership.
- Dashboard rejects unauthenticated/cross-origin changes and private path access; agent updates require separate authentication.
- Direct result publication, revision conflicts, independent wallet/result deletion, legacy migration and stale updates tested.
- Selections persist; refreshed findings preserve shortlisted/selected options; mutually exclusive costs cannot be combined.
- Amounts use explicit structured values; unknown costs remain unknown; totals stay separated by cash currency and points program.
- Remembered profile existence is not authentication evidence; sign-in stays on official provider pages.
- Remember/forget changes take effect on connection restart and are accurately described. No private data enters exports or assets.
- Browser checks at mobile and desktop sizes; wallet editing, itinerary components, filters, shortlist, comparison, export and deletion work.
- Provider images have source records or explicit fallbacks. Public site makes no runtime third-party asset or account requests.
- Live provider evidence is recorded independently. Passing synthetic tests never changes authored status.
- Publication/deployment follow review of the concrete build and migration instructions.

- Compact wallet tables preserve legacy reporting dates, unknowns and asset types; import never overwrites an existing wallet.
- Vault wrong-password/tampering, session isolation, stale writes, atomic failure and expiry tested; credentials absent from state and exports.
- Each purchase can show its payment card and planned/used/not-used/conditional/unavailable benefits; used requires dated evidence.
- Local plugin/skill browsing is read-only and scopes document reads to listed packages.

- Spending uses the existing local server. Posted activity imports preview before saving; invalid rows block the whole import. Review states, exact repeat protection, overlap flags, decimal totals, currency separation, CSV injection protection and browser-only API access are tested.
- Source downloads and exported CSVs are independent of ledger deletion. PDF conversion requires reconciliation; no universal automated PDF parser or live bank verification is claimed.

## Component layouts

Run `python3 -m unittest discover -s tests -v`, then `PLAYWRIGHT_MODULE=/path/to/playwright node tests/layout-browser.cjs`. Verify the fixed Concierge Travel view, mapped and unmapped routes, saved-trip switching and mobile widths without changing wallet or statement data. Layouts must reject unknown components, unsupported sources and executable/remote fields. Check the shared renderer with populated wallet tables and itinerary payment/benefit details on the website gallery. Native discovery should expose dashboard-builder in core (eight skills) plus spending-analysis (twelve total across two plugins).

Keep the core assets/components/v1 files byte-identical to the website public copies using its explicit sync script. Public previews use synthetic data only. A hosted MCP deployment is separate from plugin installation and static hosting.

Run routes-browser.cjs and signin-browser.cjs with synthetic data to check people/account linking, map opt-in, offline exports and the credential MCP bridge. No real provider account is required.
