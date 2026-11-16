"""Local CSV ledger. Positive amounts are outflows; all imports require review."""
import csv
import argparse
from contextlib import contextmanager
from collections import defaultdict
from copy import deepcopy
from datetime import datetime
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import uuid

MAX_ROWS = 10000
FIELDS = ('date', 'description', 'amount', 'debit', 'credit', 'category', 'type', 'currency')
ALIASES = {
    'date': ('transaction date', 'date', 'trans. date', 'posted date', 'posting date', 'post date'),
    'description': ('description', 'payee', 'merchant', 'transaction description'),
    'amount': ('amount', 'transaction amount'),
    'debit': ('debit', 'debits', 'withdrawal', 'withdrawals'),
    'credit': ('credit', 'credits', 'deposit', 'deposits'),
    'category': ('category',), 'type': ('type', 'transaction type'), 'currency': ('currency',),
}
TYPES = ('expense', 'refund', 'payment', 'transfer', 'income', 'unknown')
REVIEWS = ('needs-review', 'approved', 'excluded')


def text(value, name, maximum=300, required=True):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ValueError(f'Enter a valid {name} (up to {maximum} characters).')
    return value.strip()


def money(value):
    value = value.strip().replace(',', '')
    if value.startswith('$'):
        value = value[1:]
    if value.startswith('(') and value.endswith(')'):
        value = '-' + value[1:-1]
    if not re.fullmatch(r'[+-]?\d+(?:\.\d{1,2})?', value):
        raise ValueError('Use an amount with at most two decimal places; no currency conversion is performed.')
    number = Decimal(value)
    if abs(number) > Decimal('1000000000'):
        raise ValueError('Amount exceeds the supported limit.')
    return number.quantize(Decimal('.01'))


def iso_date(value):
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
        try:
            return datetime.strptime(value.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError('Use YYYY-MM-DD or US month/day/year dates, including the year.')


def classify(description, raw_type, category, amount):
    kind = raw_type.lower().strip()
    if kind in ('payment', 'credit card payment') or re.search(r'\b(autopay|automatic payment|payment thank you|online payment)\b', description.lower()):
        return 'payment', 'Card payments'
    if kind in ('transfer', 'xfer') or re.search(r'\b(transfer|zelle|venmo)\b', description.lower()):
        return 'transfer', 'Transfers'
    if kind in ('refund', 'return'):
        return 'refund', category or 'Uncategorized'
    if kind in ('income', 'payroll', 'interest income'):
        return 'income', category or 'Income'
    if amount < 0:
        return 'unknown', category or 'Uncategorized'
    if category:
        return 'expense', category
    for pattern, label in (
        (r'\b(restaurant|cafe|coffee|pizza|doordash|grubhub)\b', 'Dining'),
        (r'\b(grocery|whole foods|trader joe|supermarket)\b', 'Groceries'),
        (r'\b(airlines?|airways|hotel|hilton|marriott|hyatt)\b', 'Travel'),
        (r'\b(uber|lyft|transit|parking|subway)\b', 'Transportation'),
        (r'\b(netflix|spotify|hulu)\b', 'Subscriptions'),
    ):
        if re.search(pattern, description.lower()):
            return 'expense', label
    return 'expense', 'Uncategorized'


def parse(body):
    if not isinstance(body, dict) or set(body) - {'content', 'filename', 'bank', 'account', 'currency', 'sign', 'mapping'}:
        raise ValueError('Unexpected import fields.')
    content = text(body.get('content'), 'CSV contents', 1_200_000)
    filename = text(body.get('filename'), 'file name')
    if not filename.lower().endswith('.csv'):
        raise ValueError('Import a transaction CSV. PDF statements need local extraction and reconciliation first; see the Spending skill guides.')
    bank = text(body.get('bank'), 'bank')
    account = text(body.get('account'), 'account alias')
    currency = text(body.get('currency'), 'currency').upper()
    if not re.fullmatch('[A-Z]{3}', currency):
        raise ValueError('Use a three-letter currency code, for example USD.')
    sign = body.get('sign')
    if sign not in ('positive', 'negative'):
        raise ValueError('Choose whether purchases are positive or negative in this export.')
    # Skip only a bounded preamble; never skip malformed transaction rows.
    try:
        rows = list(csv.reader(io.StringIO(content.lstrip('\ufeff')), strict=True))
    except csv.Error:
        raise ValueError('Malformed CSV quoting. Download a fresh export or correct the file.') from None
    if len(rows) > MAX_ROWS + 30:
        raise ValueError(f'Import at most {MAX_ROWS} rows at a time.')
    header_index = next((i for i, row in enumerate(rows[:30]) if any(c.strip().lower() in ALIASES['description'] for c in row) and any(c.strip().lower() in ALIASES['date'] for c in row)), 0)
    if not rows:
        raise ValueError('The CSV is empty.')
    headers = [x.strip() for x in rows[header_index]]
    if len(headers) != len(set(headers)):
        raise ValueError('CSV column names must be unique.')
    mapping = body.get('mapping') or {key: next((h for alias in aliases for h in headers if h.lower() == alias), '') for key, aliases in ALIASES.items()}
    if not isinstance(mapping, dict) or set(mapping) - set(FIELDS) or any(v not in headers and v != '' for v in mapping.values()):
        raise ValueError('Column mapping must use names from the CSV header.')
    if not mapping.get('date') or not mapping.get('description') or not (mapping.get('amount') or mapping.get('debit') and mapping.get('credit')):
        return {'headers': headers, 'mapping': mapping, 'rows': [], 'errors': ['Map date, description and either Amount or both Debit and Credit.'], 'file_id': None}
    result, errors = [], []
    for index, row in enumerate(rows[header_index + 1:], header_index + 2):
        if not any(c.strip() for c in row):
            continue
        try:
            if len(row) != len(headers):
                raise ValueError('Column count differs from the header.')
            cells = dict(zip(headers, row))
            def get(key):
                return cells.get(mapping.get(key, ''), '').strip()
            day = iso_date(get('date'))
            description = text(get('description'), 'description', 1000)
            if mapping.get('debit') and mapping.get('credit'):
                debit, credit = money(get('debit') or '0'), money(get('credit') or '0')
                if debit < 0 or credit < 0 or debit and credit:
                    raise ValueError('Debit and Credit must be nonnegative, with only one nonzero per row.')
                amount = debit - credit
            else:
                amount = money(get('amount')) * (-1 if sign == 'negative' else 1)
            row_currency = get('currency').upper() or currency
            if not re.fullmatch('[A-Z]{3}', row_currency):
                raise ValueError('Invalid currency code.')
            category = text(get('category'), 'category', 100, False)
            raw_type = text(get('type'), 'transaction type', 100, False)
            kind, suggested = classify(description, raw_type, category, amount)
            fingerprint = hashlib.sha256(json.dumps([bank.casefold(), account.casefold(), day, description.casefold(), str(amount), row_currency]).encode()).hexdigest()
            result.append({'id': uuid.uuid4().hex, 'date': day, 'description': description, 'amount': str(amount), 'currency': row_currency,
                           'bank': bank, 'account': account, 'category': suggested, 'type': kind, 'review': 'needs-review',
                           'source': filename, 'source_row': index, 'source_category': category, 'source_type': raw_type,
                           'fingerprint': fingerprint, 'possible_duplicate': False})
        except (ValueError, InvalidOperation) as error:
            errors.append(f'Row {index}: {error}')
    if not result and not errors:
        errors.append('No transaction rows were found.')
    file_id = hashlib.sha256(json.dumps([content, bank.casefold(), account.casefold(), currency, sign, mapping], sort_keys=True).encode()).hexdigest()
    return {'headers': headers, 'mapping': mapping, 'rows': result, 'errors': errors, 'file_id': file_id}


def summarize(rows):
    totals = defaultdict(lambda: Decimal('0'))
    for row in rows:
        if row['review'] == 'approved' and row['type'] in ('expense', 'refund'):
            totals[(row['date'][:7], row['currency'], row['category'])] += Decimal(row['amount'])
    return [{'month': key[0], 'currency': key[1], 'category': key[2], 'net_spending': str(value)} for key, value in sorted(totals.items())]


class Ledger:
    def __init__(self, root, read, write):
        self.path, self.read, self.write = root / 'spending.json', read, write

    def state(self):
        state = self.read(self.path, {'version': 1, 'revision': 'empty', 'imports': [], 'rows': []})
        if state.get('version') != 1:
            raise ValueError('Unsupported spending data version. Preserve the original file.')
        return state

    def snapshot(self):
        state = self.state()
        return {**state, 'totals': summarize(state['rows'])}

    def action(self, action, body):
        if not isinstance(body, dict):
            raise ValueError('Expected an object.')
        state = self.state()
        if action in ('preview', 'import'):
            allowed = {'import'} if action == 'preview' else {'import', 'expected_revision'}
            if set(body) != allowed:
                raise ValueError('Unexpected import request fields.')
            preview = parse(body['import'])
            seen = {row['fingerprint'] for row in state['rows']}
            for row in preview['rows']:
                row['possible_duplicate'] = row['fingerprint'] in seen
            preview['already_imported'] = preview['file_id'] in state['imports']
            if action == 'preview':
                return preview
        if body.get('expected_revision') != state['revision']:
            raise ValueError('Spending changed in another session. Read the latest revision before saving.')
        if action == 'import':
            if preview['errors']:
                raise ValueError('Fix every row error before importing. No rows were saved.')
            if preview['already_imported']:
                raise ValueError('This file and mapping were already imported for this account.')
            if len(state['rows']) + len(preview['rows']) > MAX_ROWS:
                raise ValueError(f'The local ledger supports {MAX_ROWS} rows. Export and clear it before starting another ledger.')
            state['rows'].extend(preview['rows'])
            state['imports'].append(preview['file_id'])
        elif action == 'update':
            if set(body) != {'expected_revision', 'changes'} or not isinstance(body['changes'], list) or not body['changes'] or len(body['changes']) > MAX_ROWS:
                raise ValueError('Provide transaction changes.')
            by_id = {row['id']: row for row in state['rows']}
            for change in body['changes']:
                if not isinstance(change, dict) or set(change) != {'id', 'category', 'type', 'review'} or change['id'] not in by_id:
                    raise ValueError('Invalid transaction update.')
                category = text(change['category'], 'category', 100)
                if change['type'] not in TYPES or change['review'] not in REVIEWS:
                    raise ValueError('Invalid transaction type or review state.')
                row = by_id[change['id']]
                if change['review'] == 'approved':
                    if change['type'] == 'unknown':
                        raise ValueError('Choose the transaction type before approving.')
                    amount = Decimal(row['amount'])
                    if change['type'] == 'expense' and amount < 0 or change['type'] in ('refund', 'income') and amount > 0:
                        raise ValueError('Transaction type disagrees with its amount. Check the source sign convention.')
                row.update(category=category, type=change['type'], review=change['review'])
        elif action == 'delete':
            if set(body) != {'expected_revision', 'confirm'} or body['confirm'] != 'delete-spending':
                raise ValueError('Confirm deleting the spending ledger.')
            if self.path.is_symlink():
                raise ValueError('Refusing a symlink.')
            self.path.unlink(missing_ok=True)
            return self.snapshot()
        else:
            raise ValueError('Unknown spending action.')
        state['revision'] = uuid.uuid4().hex
        self.write(self.path, state)
        return self.snapshot()

    def export(self, summary=False):
        rows = summarize(self.state()['rows']) if summary else self.state()['rows']
        columns = ('month', 'currency', 'category', 'net_spending') if summary else ('date', 'description', 'amount', 'currency', 'bank', 'account', 'category', 'type', 'review', 'possible_duplicate', 'source', 'source_row', 'source_category', 'source_type')
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        writer.writerow(columns)
        for row in rows:
            cells = []
            for key in columns:
                value = str(row[key])
                # Spreadsheet formulas from bank descriptions must remain inert text.
                if key not in ('amount', 'net_spending', 'source_row') and value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
                    value = "'" + value
                cells.append(value)
            writer.writerow(cells)
        return ('\ufeff' + output.getvalue()).encode('utf-8')


def read_json(path, default=None):
    if path.is_symlink():
        raise ValueError('Refusing a symlink in private application data.')
    return json.loads(path.read_text()) if path.exists() else deepcopy(default)


def atomic_json(path, value):
    if path.is_symlink():
        raise ValueError('Refusing to replace a symlink.')
    fd, temporary = tempfile.mkstemp(prefix='.walletfreak-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(value, output, indent=2, allow_nan=False)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def exclusive(path):
    if path.is_symlink():
        raise ValueError('Refusing a symlink lock.')
    fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        if os.name == 'nt':
            import msvcrt
            if os.fstat(fd).st_size == 0:
                os.write(fd, b'0')
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', default=os.environ.get('WALLETFREAK_DATA', '~/.walletfreak/local'))
    parser.add_argument('command', choices=('snapshot', 'preview', 'import', 'update', 'export', 'delete'))
    parser.add_argument('--input', default='-', help='JSON request file; default: stdin')
    parser.add_argument('--output', help='New CSV destination for export; refuses overwrites')
    parser.add_argument('--summary', action='store_true', help='Export approved monthly totals')
    args = parser.parse_args()
    if args.command == 'export' and not args.output:
        parser.error('export requires --output <new.csv>')
    directory = Path(args.directory).expanduser()
    if directory.is_symlink():
        raise ValueError('Refusing a symlink data directory.')
    directory = directory.resolve()
    if directory == Path.home() or directory.parent == directory or any((p / '.git').exists() for p in (directory, *directory.parents)):
        raise ValueError('Choose a dedicated private directory outside source repositories.')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if os.name != 'nt' and directory.stat().st_mode & 0o077:
        raise ValueError('Choose an owner-only private data directory (permissions 0700).')
    with exclusive(directory / 'spending.lock'):
        ledger = Ledger(directory, read_json, atomic_json)
        if args.command == 'export':
            content = ledger.export(args.summary)
            destination = Path(args.output).expanduser()
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write(content)
            result = {'exported': str(destination)}
        elif args.command == 'snapshot':
            result = ledger.snapshot()
        else:
            body = json.load(sys.stdin) if args.input == '-' else read_json(Path(args.input).expanduser())
            result = ledger.action(args.command, body)
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Spending operation failed: {error}', file=sys.stderr)
        sys.exit(1)
