# Validation — 0.5 skills-only release

Executed 2026-11-15 on macOS with Python 3.13, Node.js 23 and Chrome.

- Unit suite: 18 checks pass for catalogs/package links/manifests, redemption arithmetic, CSV formats/signs, duplicates, invalid-import atomicity, revision conflicts, currency separation, formula-safe exports, PDF overwrite refusal and standalone CLI review/export/file safeguards.
- Bundled skill-creator quick validator: all 13 skills pass. PyYAML was installed only in a temporary validation environment, not as a plugin dependency.
- Claude Code native validation: marketplace and all four plugin manifests pass.
- Real-Chrome MCP smoke: direct pinned MCP discovery passes; saved-credential bridge tools are absent; a synthetic local login remains in one session and is absent in a fresh isolated session. No real provider account was accessed.
- git diff --check passes.

Native Codex plugin command availability was checked, but a fresh Codex/Claude installation and user-operated provider login were not exercised. The smoke test verifies browser session behavior, not the agent's manual-login handoff or provider automation compatibility. Hertz is authored only: official redemption/FAQ pages were reviewed, but no live rental/award or authenticated search was tested. Existing provider evidence remains in provider-verification.json.

Existing private runtime data was neither accessed nor changed. Source publication does not deploy Firebase hosting; website validation is recorded in its repository.

## Individual-card family releases

Each published family passes the unit suite (including catalog identity, aliases, guide paths and scenario references), Credit Cards skill validation, native Claude plugin validation and git diff --check before commit/push. Scenario prompts are authored synthetic review cases; they are not executed model tests. Official sources are research entry points that require current account-specific terms at use time. No real card accounts, logins, enrollments or transactions are tested.

Completed 2026-11-16: 111 individual U.S. card guides across 24 families, including personal/business and special/legacy variants. Each family was validated, committed and pushed separately to main. The 20-check unit suite, four Credit Cards skill validators and Claude manifest validation pass for each published family; the final full skill pass is recorded below after execution. Plus signs are preserved when checking aliases (One Key+ differs from One Key). Old grouped Hilton/other-card references are replaced by individual guides. No static benefit amounts, live account certification or executed model-scenario pass is claimed.

Final cross-package check: all 13 skill entrypoints and the native Claude marketplace validator pass.
