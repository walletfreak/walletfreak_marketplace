# Skills-only refactor

Release 0.5 removes the local planner/dashboard, layouts, component catalog/assets, credential vault/bridge, custom browser proxy and dashboard startup hook. A single pinned Playwright MCP configuration opens headed isolated Chrome. Users log in directly when notified, and research resumes only after confirmation and authenticated-state verification.

Travel, provider references, lounges, booking review, routes, card decisions, requested balance checks, spending and shopping remain focused skills. Hertz adds scoped rental/points comparisons. The validated CSV ledger moves intact to Spending, with a small standalone CLI and no server. The public website becomes a static GitHub landing page.

Existing private data remains outside source and is not erased or read by the new browser. Native-host installation and real provider authentication require their own verification. Git source publication does not deploy Firebase hosting.
