# Contributing

Keep four focused skill packages and one shared browser configuration. Prefer short task-specific instructions and relevant provider references over repeated common rules or application infrastructure. Results belong in conversation; files and profiles are optional requested outputs.

For provider changes, update root providers.json and its byte-identical bundled copy, the provider-specific guide and docs/provider-verification.json. Preserve stable IDs, program aliases and existing verification evidence. Authored guidance and official-link checks are not live search certification. Hertz routes to hertz-research; other providers use provider-research references.

Keep relative Markdown links within their installed package. Discover cross-package skills through the host instead of importing neighboring plugin files. Update both host manifests and marketplace versions for a release. Do not add a credential service, dashboard dependency, startup hook or private data to an artifact.

For card coverage, add one product guide and its exact U.S. market/variant/aliases to plugins/walletfreak-credit-cards/cards.json. Reuse shared card checks; keep source links and product-specific distinctions in the guide. Related products do not inherit credits or transfer permissions. Add a synthetic family scenario, preserve existing entries, validate links/aliases and bump the Credit Cards version in both host manifests and the Claude marketplace for each published family.

Run `python3 -m unittest discover -s tests -v` and available plugin/skill validators. Use synthetic data in temporary directories. Run `python3 tests/browser-mcp-smoke.py` for an optional real-Chrome isolation check; provider login/testing is separate and user-operated. Preserve spending's row validation, duplicate review, decimal arithmetic, revision checks, atomic writes, locks and CSV injection protection.

The website repository owns a static landing page and Firebase configuration, with no runtime sibling-checkout dependency. Commit/push source and deploy hosting only within the user's requested scope; they are separate actions.
