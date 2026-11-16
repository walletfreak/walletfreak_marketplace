# Ledger commands and spending reports

Run the bundled `scripts/spending.py` with `--directory <private-directory>` before the command. JSON requests go on stdin (`--input <file.json>` is also supported). Run snapshot first to get the revision and review current data. Every change takes an exclusive local lock and checks the expected revision; reread after conflicts instead of overwriting.

- `snapshot`: rows, import IDs, current revision and approved monthly totals.
- `preview`: `{"import":{"content":"<CSV text>","filename":"activity.csv","bank":"Chase","account":"Personal card","currency":"USD","sign":"negative"}}`. Use `positive` or `negative` from a verified purchase; optional `mapping` maps canonical names to actual CSV headers. No data is saved.
- `import`: the same `import` plus `"expected_revision":"<snapshot revision>"`. All rows start needing review. Report row errors before saving.
- `update`: `{"expected_revision":"<revision>","changes":[{"id":"<row ID>","category":"Dining","type":"expense","review":"approved"}]}`. Types: expense, refund, payment, transfer, income, unknown. Reviews: needs-review, approved, excluded. Unknown types cannot be approved; examine possible duplicates individually.
- `export --output <new.csv>`: transactions CSV. Add `--summary` for approved monthly category totals. Existing destinations are never overwritten. Exported text cells are protected against spreadsheet formula injection.
- `delete`: `{"expected_revision":"<revision>","confirm":"delete-spending"}`. Use only when the user requests deletion; removes only this ledger.

For reports, show covered accounts/periods and currencies, approved expenses, refunds, excluded payments/transfers and unresolved rows. Cite source file names and row/page/section references without account numbers. Separate actual transactions from statement totals and pending items. Verify arithmetic against the relevant source sections; do not treat missing values as zero or one charge as proof of a recurring subscription.

Keep reports in conversation by default. Export a sanitized CSV or report only when requested. The helper stores a private plaintext spending.json with owner-only file permissions and atomic replacement. Originals are never edited. Agent-assisted interpretation may enter host/model context.
