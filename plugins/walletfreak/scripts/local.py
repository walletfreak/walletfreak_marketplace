#!/usr/bin/env python3
"""Private results viewer and editable personal travel wallet."""
import argparse
from contextlib import contextmanager
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit
from urllib.request import Request, urlopen
import uuid

from vault import Vault
from profile_import import parse_profile
import inventory
from spending import Ledger
from documents import Documents
from shopping import Shopping
from confirmations import parse as preview_confirmations
from layouts import Layouts, CATALOG

PLUGIN = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PLUGIN / 'skills/trip-board/scripts'))
import render_board as board

PROVIDERS = json.loads((PLUGIN / 'providers.json').read_text())
LIMIT = 2_000_000
UI_ASSETS = {'components/v1/vendor/leaflet.js', 'components/v1/vendor/leaflet.css', 'dashboard/wallet-setup.js', 'dashboard/onboarding.js', 'dashboard/app.js', 'dashboard/spending.js', 'dashboard/finance.js', 'dashboard/shopping.js', 'dashboard/overview.js', 'dashboard/actions.js', 'components/v1/components.js', 'components/v1/components.css', 'components/v1/catalog.json', 'components/v1/layout.schema.json', 'dashboard/app.css', 'mascot.png', 'brands.json', 'cards.json', 'wallet-assets.json'}


def now():
    return datetime.now(timezone.utc).isoformat()


def data_directory():
    path = Path(os.environ.get('WALLETFREAK_DATA', str(Path.home() / '.walletfreak/local'))).expanduser()
    if path.is_symlink():
        raise ValueError('The WalletFreak data directory cannot be a symlink.')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = path.resolve()
    if path == Path.home() or path.parent == path or (path / '.git').exists():
        raise ValueError('Choose a dedicated private WalletFreak data directory.')
    if os.name != 'nt':
        path.chmod(0o700)
    return path


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


def browser_active(root):
    try:
        with exclusive(root / 'browser.lock'):
            return False
    except OSError:
        return True


def fields(value, allowed, required=()):
    if not isinstance(value, dict) or value.keys() - set(allowed) or set(required) - value.keys():
        raise ValueError('Missing or unsupported fields.')


def short_text(value, name, required=False, maximum=4000):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ValueError(f'Provide valid {name}.')
    return value.strip()


def clean_findings(value):
    board.validate(value)
    result = deepcopy(value)
    for option in result.get('options', []):
        if 'image' in option:
            option['image']['url'] = board.photo_url(option['image']['url'])
            option['image']['source_url'] = board.source_url(option['image']['source_url'])
        for source in option.get('sources', []):
            source['url'] = board.source_url(source['url'])
    for item in result.get('itinerary', []):
        for field in ('place', 'route'):
            if item.get(field, {}).get('source_url'):
                item[field]['source_url'] = board.source_url(item[field]['source_url'])
    for item in result.get('research', []):
        if item.get('url'):
            item['url'] = board.source_url(item['url'])
    return result


def selected_totals(trip):
    cash, points, unknown = {}, {}, []
    by_id = {o['id']: o for o in trip['findings'].get('options', [])}
    for identifier in trip['selected']:
        option = by_id[identifier]
        cost = option.get('cost')
        if not cost or not cost['complete'] or option['status'] != 'available':
            unknown.append(option['title'])
            continue
        currency = cost['currency']
        cash[currency] = cash.get(currency, Decimal(0)) + Decimal(cost['cash'])
        if cost.get('points'):
            program = cost['program']
            points[program] = points.get(program, 0) + cost['points']
    return {'cash': {c: str(v) for c, v in cash.items()}, 'points': points, 'unknown': unknown}


def export_findings(trip):
    result = deepcopy(trip['findings'])
    result['summary'] = 'Research snapshot. Recheck all prices, terms and availability. ' + result.get('summary', '')
    options = result.get('options', [])
    result.setdefault('research', []).append({'title': 'Your saved shortlist', 'detail': '; '.join(o['title'] for o in options if o['id'] in trip['shortlist']) or 'No options shortlisted.'})
    totals = selected_totals(trip)
    amounts = [f'{currency} {amount}' for currency, amount in totals['cash'].items()]
    amounts += [f'{amount:,} {program} points' for program, amount in totals['points'].items()]
    result['research'].append({'title': 'Selected items: partial subtotal', 'detail': (' + '.join(amounts) or 'No verified costs selected.') + '\nNot a whole-trip price. Conditional credits excluded. Unpriced or unverified selections: ' + ('; '.join(totals['unknown']) or 'none')})
    result.setdefault('itinerary', [])
    linked = {item.get('option_id') for item in result['itinerary']}
    result['itinerary'] += [{'when':'Proposed selection; not reserved', 'title':o['title'], 'detail':o.get('product') or 'Schedule not recorded.', 'option_id':o['id']} for o in options if o['id'] in trip['selected'] and o['id'] not in linked]
    return result


def empty_wallet():
    return {'version': 2, 'revision': 'empty', 'cards': [], 'programs': [], 'benefits': [], 'preferences': '', 'people': []}


def validate_wallet(value):
    fields(value, ('cards', 'programs', 'benefits', 'preferences', 'people'), ('cards', 'programs', 'benefits', 'preferences'))
    short_text(value['preferences'], 'preferences')
    people = value.get('people', [])
    if not isinstance(people,list) or len(people)>100: raise ValueError('Use at most 100 people.')
    person_ids = set()
    for person in people:
        fields(person, ('id','name'), ('id','name'))
        if not isinstance(person['id'],str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,64}',person['id']) or person['id'] in person_ids: raise ValueError('People need unique IDs.')
        short_text(person['name'],'person name',True,300)
        person_ids.add(person['id'])
    columns = {
        'cards': ('name', 'nickname', 'owner', 'notes', 'reported_on'),
        'programs': ('name', 'owner', 'balance', 'approximate', 'status', 'preserve', 'reported_on', 'notes'),
        'benefits': ('name', 'owner', 'kind', 'remaining', 'expires_on', 'notes', 'reported_on')}
    for section, allowed in columns.items():
        rows = value[section]
        if not isinstance(rows, list) or len(rows) > 100:
            raise ValueError('Use at most 100 entries per wallet section.')
        for row in rows:
            fields(row, (*allowed, 'id', 'reward_account_id', 'card_id', 'program_id', 'person_id', 'synced_at', 'sync_source', 'account_label', 'member_hint', 'credential_id'), tuple(k for k in allowed if k != 'nickname' and (k != 'notes' or section != 'programs')))
            for key in allowed:
                if key not in row: continue
                if key in ('approximate', 'preserve'):
                    if type(row[key]) is not bool:
                        raise ValueError('Wallet choices must be true or false.')
                else:
                    short_text(row[key], key, key == 'name', 4000 if key == 'notes' else 300)
                if key.endswith('_on') and row[key]:
                    date.fromisoformat(row[key])
            for key in ('account_label', 'member_hint', 'credential_id'):
                if key in row:
                    if section != 'programs' and not (section == 'cards' and key == 'credential_id'): raise ValueError('Account metadata belongs to rewards accounts.')
                    short_text(row[key], key, False, 300)
                    if key == 'credential_id' and row[key] and not re.fullmatch(r'[a-f0-9]{32}', row[key]): raise ValueError('Invalid saved sign-in ID.')
            if section == 'programs' and row['balance'] and not re.fullmatch(r'\d{1,13}', row['balance']):
                raise ValueError('Points must be a nonnegative whole number or blank for unknown.')
            if section == 'benefits' and row['kind'] not in ('credit', 'certificate', 'gift-card', 'travel-bank', 'travel-credit', 'companion', 'upgrade', 'lounge-pass', 'membership', 'voucher', 'cashback', 'other'):
                raise ValueError('Choose a supported wallet asset type.')

    ids = set()
    for section in columns:
        for row in value[section]:
            if row.get('person_id') and row['person_id'] not in person_ids: raise ValueError('Choose an existing person.')
            if 'synced_at' in row: board.timestamp(row['synced_at'],'synced_at')
            if 'sync_source' in row: board.source_url(row['sync_source'])
            identifier = row.get('id')
            if identifier is not None:
                if not isinstance(identifier, str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,64}', identifier) or identifier in ids:
                    raise ValueError('Wallet entries need unique stable IDs.')
                ids.add(identifier)
            permitted = {'cards': {'reward_account_id'}, 'programs': set(), 'benefits': {'card_id', 'program_id'}}[section]
            for key, target in [('reward_account_id','programs'), ('card_id','cards'), ('program_id','programs')]:
                if key not in row: continue
                if key not in permitted or not isinstance(row[key], str):
                    raise ValueError('Invalid wallet relationship.')
                if row[key] and row[key] not in {r.get('id') for r in value[target]}:
                    raise ValueError('Linked wallet entry no longer exists. Choose another or unlink it.')


def identify_wallet(value):
    result = deepcopy(value)
    result.setdefault('people', [])
    by_name = {person['name']:person['id'] for person in result['people']}
    for section in ('cards', 'programs', 'benefits'):
        for row in result[section]:
            row.setdefault('id', uuid.uuid4().hex)
            if row.get('owner') and not row.get('person_id'):
                if row['owner'] not in by_name:
                    by_name[row['owner']] = uuid.uuid4().hex
                    result['people'].append({'id':by_name[row['owner']], 'name':row['owner']})
                row['person_id'] = by_name[row['owner']]
    return result


class Store:
    def __init__(self, root):
        self.root = root
        self.path = root / 'results.json'
        self.vault = Vault(root, read_json, atomic_json)
        self.inventory = None
        self.spending = Ledger(root, read_json, atomic_json)
        self.documents = Documents(root, read_json, atomic_json)
        self.shopping = Shopping(root, read_json, atomic_json)
        self.layouts = Layouts(root, read_json, atomic_json)
        # Move the old store once. Manual deletion must never resurrect old results.
        legacy = root / 'state.json'
        if not self.path.exists() and legacy.exists():
            previous = read_json(legacy)
            if previous.get('version') != 1:
                raise ValueError('Unsupported data version; original data retained.')
            if self.path.is_symlink():
                raise ValueError('Refusing a symlink in private application data.')
            legacy.replace(self.path)
        state = self.read_results()
        if state.get('version') == 1:
            trips = [{key: trip[key] for key in ('id', 'findings', 'shortlist', 'selected', 'selection_revision')}
                     for trip in state['trips']]
            for trip in trips:
                trip['revision'] = 0
            atomic_json(self.path, {'version': 2, 'trips': trips})

    def read_results(self):
        state = read_json(self.path, {'version': 2, 'trips': []})
        if state.get('version') not in (1, 2):
            raise ValueError('Unsupported data version; original data retained.')
        return state

    def wallet(self):
        path = self.root / 'wallet.json'
        value = read_json(path, empty_wallet())
        if value.get('version') not in (1, 2):
            raise ValueError('Unsupported wallet version; original data retained.')
        if value['version'] == 1:
            validate_wallet({k:v for k,v in value.items() if k not in ('version','revision')})
            backup = self.root / 'wallet-v1-backup.json'
            if not backup.exists():
                atomic_json(backup, value)
            value = identify_wallet(value)
            value.update(version=2, revision=uuid.uuid4().hex)
            atomic_json(path, value)
        return value

    def refresh_requests(self):
        value = read_json(self.root / 'refresh-requests.json', {'version': 1, 'requests': []})
        if value.get('version') != 1 or not isinstance(value.get('requests'), list):
            raise ValueError('Unsupported refresh request file; original data retained.')
        return value

    def trip(self, identifier, state=None):
        state = self.read_results() if state is None else state
        for trip in state['trips']:
            if trip['id'] == identifier:
                return trip
        raise ValueError('Results no longer exist. Refresh the page.')

    def snapshot(self):
        result = self.read_results()
        for trip in result['trips']:
            trip['totals'] = selected_totals(trip)
        result.update(wallet=self.wallet(), refresh_requests=self.refresh_requests()['requests'], shopping=self.shopping.state(), providers=PROVIDERS, legacy_profile=(self.root.parent / 'traveler-profile.md').is_file())
        settings = read_json(self.root / 'settings.json', {})
        result['onboarding'] = {
            'show': settings.get('onboarding_started', False) or (
                not settings.get('onboarding_done', False)
                and result['wallet']['revision'] == 'empty'
                and not (self.root / 'layout.json').exists()
                and not result['trips']
            )
        }
        return result

    def user_action(self, action, body):
        if action == 'refresh-account':
            fields(body, ('section', 'id'), ('section', 'id'))
            if body['section'] not in ('cards', 'programs') or not isinstance(body['id'], str):
                raise ValueError('Choose a card or rewards account.')
            row = next((r for r in self.wallet()[body['section']] if r['id'] == body['id']), None)
            if not row or not row.get('credential_id'):
                raise ValueError('Save a sign-in for this account before requesting a refresh.')
            requests = self.refresh_requests()
            requests['requests'] = [r for r in requests['requests'] if (r.get('section'), r.get('id')) != (body['section'], body['id'])]
            requests['requests'].append({'section': body['section'], 'id': body['id'], 'requested_at': now()})
            if len(requests['requests']) > 100: raise ValueError('Finish or clear older refresh requests first.')
            atomic_json(self.root / 'refresh-requests.json', requests)
            return {'message': 'Refresh requested. Ask your agent to process pending Wallet refreshes.'}
        if action == 'onboarding':
            fields(body, ('state',), ('state',))
            if body['state'] not in ('started', 'complete'):
                raise ValueError('Choose a supported setup state.')
            settings = read_json(self.root / 'settings.json', {})
            settings['onboarding_started'] = body['state'] == 'started'
            settings['onboarding_done'] = body['state'] == 'complete'
            atomic_json(self.root / 'settings.json', settings)
            return {'message': 'Dashboard setup saved on this device.'}
        if action == 'import-confirmations':
            fields(body, ('title','items','lodging_window'), ('title','items'))
            title=short_text(body['title'],'trip title',True,200)
            items=body['items']
            if not isinstance(items,list) or not 1<=len(items)<=20:
                raise ValueError('Review 1–20 bookings before saving.')
            itinerary,options,selected,gaps=[],[],[],[]
            for index,item in enumerate(items):
                fields(item, ('kind','day','arrival_day','when','title','detail','price','booking_status','stay'), ('kind','day','when','title','detail','price','booking_status'))
                if item['kind'] not in ('flight','hotel','transport','other') or item['booking_status'] not in ('booked','proposed'):
                    raise ValueError('Choose a supported booking type and status.')
                day=short_text(item['day'],'booking date',True,10)
                date.fromisoformat(day)
                row={'day':day,'when':short_text(item['when'],'booking time',True,200),
                     'title':short_text(item['title'],'booking title',True,200),
                     'detail':short_text(item['detail'],'booking detail',True,500),
                     'booking_status':item['booking_status']}
                if item.get('stay'):
                    stay=item['stay']
                    fields(stay,('check_in','check_out'),('check_in','check_out'))
                    if date.fromisoformat(stay['check_out'])<=date.fromisoformat(stay['check_in']):
                        raise ValueError('Hotel check-out must follow check-in.')
                    row['stay']=stay
                price=short_text(item['price'],'reported price',False,40)
                if price:
                    match=re.fullmatch(r'([A-Z]{3}) ([0-9]{1,9}(?:\.[0-9]{1,2})?)',price)
                    if not match: raise ValueError('Use a reported price such as USD 240.00 or leave it blank.')
                    row['price']=price
                else: gaps.append('Price not recorded for '+row['title'])
                itinerary.append(row)
            itinerary.sort(key=lambda row:row['day'])
            findings={'title':title,'summary':'Reviewed bookings imported from pasted confirmation text. Recheck all dates, status and prices with the provider.',
                      'generated_at':now(),'options':options,'itinerary':itinerary,'gaps':gaps,
                      'research':[{'title':'Confirmation import','detail':'The original email text was not stored. Fields were reviewed in the local browser.'}]}
            if 'lodging_window' in body:
                findings['lodging_window']=body['lodging_window']
            findings=clean_findings(findings)
            state=self.read_results()
            trip={'id':uuid.uuid4().hex,'revision':0,'findings':findings,'shortlist':[],
                  'selected':selected,'selection_revision':0}
            state['trips'].append(trip);atomic_json(self.path,state)
            return {'id':trip['id'],'message':'Reviewed bookings saved as an itinerary.'}
        if action == 'layout':
            return self.layouts.save(body)
        if action == 'import-profile':
            fields(body, ('expected_revision',), ('expected_revision',))
            current = self.wallet()
            if current['revision'] != body['expected_revision'] or current['revision'] != 'empty':
                raise ValueError('Import only into an empty wallet. Existing entries were not changed.')
            profile = self.root.parent / 'traveler-profile.md'
            if profile.is_symlink() or not profile.is_file() or profile.stat().st_size > 200_000:
                raise ValueError('A supported legacy profile is not available.')
            wallet = parse_profile(profile.read_text())
            validate_wallet(wallet)
            atomic_json(self.root / 'wallet.json', {**identify_wallet(wallet), 'version':2, 'revision':uuid.uuid4().hex})
            return {'message':'Imported the saved profile. Original dates and unknowns retained; the Markdown file is unchanged.'}
        if action in ('wallet', 'delete-wallet'):
            fields(body, ('wallet', 'expected_revision') if action == 'wallet' else ('expected_revision',),
                   ('wallet', 'expected_revision') if action == 'wallet' else ('expected_revision',))
            if body['expected_revision'] != self.wallet()['revision']:
                raise ValueError('Your wallet changed in another tab. Reload the wallet before saving.')
            path = self.root / 'wallet.json'
            if action == 'wallet':
                validate_wallet(body['wallet'])
                atomic_json(path, {**identify_wallet(body['wallet']), 'version': 2, 'revision': uuid.uuid4().hex})
                requests = self.refresh_requests()
                linked = {(section, row['id']) for section in ('cards', 'programs') for row in self.wallet()[section] if row.get('credential_id')}
                kept = [r for r in requests['requests'] if (r.get('section'), r.get('id')) in linked]
                if len(kept) != len(requests['requests']):
                    atomic_json(self.root / 'refresh-requests.json', {'version': 1, 'requests': kept})
                return {'message': 'Wallet saved on this device. Balances are self-reported.', 'wallet': self.wallet()}
            if path.is_symlink():
                raise ValueError('Refusing a symlink in private application data.')
            requests_path = self.root / 'refresh-requests.json'
            if requests_path.is_symlink(): raise ValueError('Refusing a symlink in private application data.')
            path.unlink(missing_ok=True)
            (self.root / 'wallet-v1-backup.json').unlink(missing_ok=True)
            requests_path.unlink(missing_ok=True)
            return {'message': 'Personal wallet deleted. Trip results and downloaded files are unchanged.'}
        if action in ('settings', 'forget'):
            settings = read_json(self.root / 'settings.json', {'remember': False, 'forget': False})
            if action == 'settings':
                fields(body, ('remember',), ('remember',))
                if type(body['remember']) is not bool:
                    raise ValueError('Remember sign-ins must be true or false.')
                settings['remember'] = body['remember']
            else:
                fields(body, ('confirm',), ('confirm',))
                if body['confirm'] != 'forget-all-local-sessions':
                    raise ValueError('Confirm forgetting all local provider sessions.')
                settings.update(remember=False, forget=True)
            atomic_json(self.root / 'settings.json', settings)
            return {'message': 'Saved. Restart the browser connection to apply on its next use.'}
        state = self.read_results()
        if action == 'clear-results':
            fields(body, ('confirm', 'expected_trips'), ('confirm', 'expected_trips'))
            if body['confirm'] != 'clear-all-trips' or body['expected_trips'] != [{'id': trip['id'], 'revision': trip['revision']} for trip in state['trips']]:
                raise ValueError('Trips changed. Refresh before clearing all trips.')
            state['trips'] = []
        elif action == 'delete-results':
            fields(body, ('id', 'expected_revision'), ('id', 'expected_revision'))
            trip = self.trip(body['id'], state)
            if body['expected_revision'] != trip['revision']:
                raise ValueError('These results changed. Refresh before deleting.')
            state['trips'].remove(trip)
        elif action == 'selection':
            fields(body, ('id', 'shortlist', 'selected', 'expected_revision'), ('id', 'shortlist', 'selected', 'expected_revision'))
            trip = self.trip(body['id'], state)
            if body['expected_revision'] != trip['selection_revision']:
                raise ValueError('Selections changed. Refresh and try again.')
            by_id = {o['id']: o for o in trip['findings'].get('options', [])}
            for key in ('shortlist', 'selected'):
                if not isinstance(body[key], list) or any(not isinstance(x, str) or x not in by_id for x in body[key]) or len(set(body[key])) != len(body[key]):
                    raise ValueError('Invalid option selection.')
            groups = [by_id[i].get('choice_group') for i in body['selected'] if by_id[i].get('choice_group')]
            if len(groups) != len(set(groups)):
                raise ValueError('Choose only one alternative from each itinerary component.')
            trip.update(shortlist=body['shortlist'], selected=body['selected'], selection_revision=trip['selection_revision'] + 1,
                        revision=trip['revision'] + 1)
        elif action == 'action-status':
            fields(body, ('id', 'action_id', 'status', 'expected_revision'), ('id', 'action_id', 'status', 'expected_revision'))
            trip = self.trip(body['id'], state)
            if body['expected_revision'] != trip['revision']:
                raise ValueError('Trip changed. Refresh before updating the action.')
            if not isinstance(body['action_id'], str) or body['action_id'] not in {item['id'] for item in trip['findings'].get('actions', [])} or body['status'] not in ('open', 'done'):
                raise ValueError('Choose an existing action and a valid status.')
            trip.setdefault('action_state', {})[body['action_id']] = body['status']
            trip['revision'] += 1
        else:
            raise ValueError('Unknown action.')
        atomic_json(self.path, state)
        return {'message': 'Trips deleted. Your personal wallet is unchanged.'} if action == 'clear-results' else {'message': 'Results deleted. Your personal wallet is unchanged.'} if action == 'delete-results' else {}

    def agent_action(self, action, body):
        if action == 'shopping-publish': return self.shopping.publish(body)
        if action == 'refresh-complete':
            fields(body, ('section', 'id'), ('section', 'id'))
            if body['section'] not in ('cards', 'programs') or not isinstance(body['id'], str):
                raise ValueError('Choose a card or rewards account.')
            requests = self.refresh_requests()
            before = len(requests['requests'])
            requests['requests'] = [r for r in requests['requests'] if (r.get('section'), r.get('id')) != (body['section'], body['id'])]
            if len(requests['requests']) == before: raise ValueError('No matching refresh request exists.')
            atomic_json(self.root / 'refresh-requests.json', requests)
            return {'message': 'Refresh request completed.'}
        if action == 'wallet-sync':
            fields(body, ('expected_revision','updates'), ('expected_revision','updates'))
            wallet=self.wallet()
            if wallet['revision']!=body['expected_revision']: raise ValueError('Wallet changed; reread it before syncing.')
            updates=body['updates']
            if not isinstance(updates,list) or not 1<=len(updates)<=100: raise ValueError('Provide 1–100 observed account updates.')
            seen=set()
            for update in updates:
                fields(update, ('program_id','person_id','balance','status','observed_at','source_url'), ('program_id','person_id','balance','observed_at','source_url'))
                if update['program_id'] in seen: raise ValueError('Update each rewards account only once.')
                seen.add(update['program_id'])
                row=next((r for r in wallet['programs'] if r['id']==update['program_id']),None)
                if row is None or not row.get('person_id') or row['person_id']!=update['person_id']: raise ValueError('Choose the matching person and existing rewards account.')
                if not isinstance(update['balance'],str) or not re.fullmatch(r'\d{1,13}',update['balance']): raise ValueError('Supply the observed whole-number balance; do not estimate.')
                board.timestamp(update['observed_at'],'observed_at')
                row.update(balance=update['balance'],approximate=False,reported_on=update['observed_at'][:10],sync_source=board.source_url(update['source_url']),synced_at=update['observed_at'])
                if 'status' in update: row['status']=short_text(update['status'],'status',False,300)
            draft={k:v for k,v in wallet.items() if k not in ('version','revision')}
            validate_wallet(draft)
            atomic_json(self.root/'wallet.json',{**draft,'version':2,'revision':uuid.uuid4().hex})
            return {'message':f'Updated {len(updates)} rewards account(s). Other wallet entries were retained.'}
        if action == 'extract-references':
            return self.documents.extract(body)
        if action == 'insights':
            return self.documents.publish(body)
        if action != 'publish':
            raise ValueError('Unknown output action. Publish findings from the conversation.')
        fields(body, ('id', 'expected_revision', 'findings'), ('findings',))
        findings = clean_findings(body['findings'])
        state = self.read_results()
        if 'id' in body:
            trip = self.trip(body['id'], state)
            if body.get('expected_revision') != trip['revision']:
                raise ValueError('Results changed. Read status before publishing an update.')
            new_ids = {o['id'] for o in findings.get('options', [])}
            if not set(trip['shortlist'] + trip['selected']) <= new_ids:
                raise ValueError('Retain selected and shortlisted options when refreshing findings; update their status instead.')
            groups = [o.get('choice_group') for o in findings.get('options', []) if o['id'] in trip['selected'] and o.get('choice_group')]
            if len(groups) != len(set(groups)):
                raise ValueError('Updated findings would combine mutually exclusive selected items.')
            kept = {item['id'] for item in findings.get('actions', [])}
            trip.update(findings=findings, action_state={key: value for key, value in trip.get('action_state', {}).items() if key in kept}, revision=trip['revision'] + 1)
        else:
            if 'expected_revision' in body:
                raise ValueError('An update revision requires a results id.')
            trip = {'id': uuid.uuid4().hex, 'revision': 0, 'findings': findings,
                    'shortlist': [], 'selected': [], 'selection_revision': 0}
            state['trips'].append(trip)
        atomic_json(self.path, state)
        return {'id': trip['id'], 'revision': trip['revision']}


class Handler(BaseHTTPRequestHandler):
    timeout = 5

    def log_message(self, *args):
        pass  # No request bodies, credentials or access tokens in logs.

    def respond(self, code, data, content_type='application/json', headers=None):
        raw = data if isinstance(data, bytes) else json.dumps(data, allow_nan=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def host_ok(self):
        return self.headers.get('Host') == self.server.authority and self.headers.get('Sec-Fetch-Site', 'same-origin') not in ('cross-site',)

    def agent(self):
        return secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + self.server.agent_token)

    def session(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            token = cookie['walletfreak'].value if 'walletfreak' in cookie else ''
            return token if token in self.server.sessions else None
        except Exception:
            return None

    def user(self):
        return self.session() is not None

    def do_GET(self):
        if not self.host_ok():
            return self.respond(403, {'error': 'Invalid local origin.'})
        route = urlsplit(self.path)
        query = parse_qsl(route.query, keep_blank_values=True)
        if route.fragment or (route.query and not (
            route.path in ('/travel', '/travel/trips') and len(query) == len({key for key, _ in query}) <= 2
            and all((key == 'trip' and re.fullmatch(r'[0-9a-f]{32}', value)) or
                    (key == 'review' and value in ('comparison', 'research')) for key, value in query)
            and ('review' not in dict(query) or 'trip' in dict(query))
        )):
            return self.respond(400, {'error': 'Unexpected URL parameters.'})
        path = route.path
        if path in ('/', '/travel', '/travel/trips', '/actions', '/credit-cards', '/wallet', '/spending', '/shopping', '/settings/sign-ins', '/settings/plugins'):
            try:
                return self.respond(200, (PLUGIN / 'assets/dashboard/index.html').read_bytes(), 'text/html; charset=utf-8')
            except OSError:
                return self.respond(503, {'error': 'Dashboard files are unavailable. Run local.py start from the current plugin installation.'})
        if path.startswith('/assets/'):
            relative = path.removeprefix('/assets/')
            allowed = UI_ASSETS.copy()
            if relative.startswith('brands/') and re.fullmatch(r'brands/[a-z0-9-]+\.(png|svg|webp|ico)', relative):
                allowed.add(relative)
            if re.fullmatch(r'cards/[a-zA-Z0-9_-]+\.(png|webp|jpe?g|avif)', relative):
                allowed.add(relative)
            if relative not in allowed:
                return self.respond(404, {'error': 'Not found.'})
            file = PLUGIN / 'assets' / relative
            if not file.is_file() or file.is_symlink():
                return self.respond(404, {'error': 'Not found.'})
            return self.respond(200, file.read_bytes(), mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        if not (self.agent() or self.user()):
            return self.respond(401, {'error': 'Open the private link returned by WalletFreak setup.'})
        if path in ('/api/layout', '/api/catalog'):
            try:
                return self.respond(200, CATALOG if path == '/api/catalog' else self.server.store.layouts.state())
            except (ValueError, KeyError, TypeError, OSError):
                return self.respond(500, {'error':'Layout could not be read. Preserve layout.json and check its format.'})
        if path == '/api/shopping':
            return self.respond(200,self.server.store.shopping.state())
        if path == '/api/references':
            try:
                return self.respond(200, self.server.store.documents.snapshot())
            except (ValueError, OSError, KeyError):
                return self.respond(500, {'error': 'References could not be read. Preserve the local files.'})
        if re.fullmatch(r'/api/references/[a-f0-9]{32}', path):
            if not self.user():
                return self.respond(403, {'error': 'Downloads require the private browser session.'})
            docs = self.server.store.documents
            entry = next((f for f in docs.state()['files'] if f['id'] == path.rsplit('/', 1)[1]), None)
            if entry is None:
                return self.respond(404, {'error': 'Reference not found.'})
            try:
                return self.respond(200, docs.file_path(entry).read_bytes(), 'application/octet-stream', {'Content-Disposition': 'attachment; filename="statement' + Path(entry['file']).suffix + '"'})
            except (ValueError, OSError):
                return self.respond(404, {'error': 'Reference file unavailable.'})
        if path in ('/api/spending', '/api/spending/transactions.csv', '/api/spending/summary.csv'):
            if not self.user():
                return self.respond(403, {'error': 'Spending data requires the private browser session.'})
            try:
                if path == '/api/spending':
                    return self.respond(200, self.server.store.spending.snapshot())
                filename = path.rsplit('/', 1)[1]
                return self.respond(200, self.server.store.spending.export(filename == 'summary.csv'), 'text/csv; charset=utf-8', {'Content-Disposition': f'attachment; filename="walletfreak-{filename}"'})
            except (ValueError, KeyError, TypeError, OSError):
                return self.respond(500, {'error': 'Spending data could not be read. Preserve the file and check its format.'})
        if path == '/api/vault':
            if not self.user():
                return self.respond(403, {'error':'Vault access requires the private browser session.'})
            try:
                return self.respond(200, self.server.store.vault.status(self.session()))
            except (ValueError,OSError) as error:
                return self.respond(400, {'error':str(error)})
        if path == '/api/plugins':
            return self.respond(200, inventory.discover(PLUGIN))
        if path == '/api/state':
            try:
                return self.respond(200, self.server.store.snapshot())
            except (ValueError, KeyError, TypeError, OSError):
                return self.respond(500, {'error': 'Local data could not be read. Preserve the files and check their format and permissions.'})
        if path == '/api/health':
            return self.respond(200, {
                'application': 'walletfreak', 'version': 1, 'plugin_root': str(PLUGIN),
                'ready': all((PLUGIN / 'assets' / asset).is_file() for asset in UI_ASSETS | {'dashboard/index.html'}),
            })
        if re.fullmatch(r'/api/export/[a-f0-9]{32}', path):
            try:
                trip = self.server.store.trip(path.rsplit('/', 1)[1])
                export = export_findings(trip)
                raw = board.render(export).encode()
                return self.respond(200, raw, 'text/html; charset=utf-8', {'Content-Disposition': 'attachment; filename="walletfreak-trip.html"'})
            except ValueError as error:
                return self.respond(400, {'error': str(error)})
        self.respond(404, {'error': 'Not found.'})

    def do_POST(self):
        if not self.host_ok() or self.headers.get('Origin') not in (None, self.server.origin):
            return self.respond(403, {'error': 'Invalid local origin.'})
        if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.respond(415, {'error': 'Use JSON requests.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= (28_000_000 if self.path == '/api/references/upload' else LIMIT):
                return self.respond(413, {'error': 'Request too large or empty.'})
            self.connection.settimeout(5)
            body = json.loads(self.rfile.read(length), parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite number.')))
            if self.path == '/api/session':
                fields(body, ('token',), ('token',))
                if not isinstance(body['token'], str) or not secrets.compare_digest(body['token'], self.server.ui_token):
                    return self.respond(401, {'error': 'Invalid private link.'})
                session = secrets.token_urlsafe(32)
                self.server.sessions.add(session)
                return self.respond(200, {}, headers={'Set-Cookie': f'walletfreak={session}; HttpOnly; SameSite=Strict; Path=/'})
            if self.path == '/api/confirmations/preview':
                if not self.user() or self.headers.get('X-WalletFreak') != '1':
                    return self.respond(403, {'error':'Confirmations require the private browser session.'})
                fields(body,('text',),('text',))
                result=preview_confirmations(body['text'])
            elif self.path == '/api/confirmations/save':
                if not self.user() or self.headers.get('X-WalletFreak') != '1':
                    return self.respond(403, {'error':'Confirmations require the private browser session.'})
                result=self.server.store.user_action('import-confirmations',body)
            elif self.path in ('/api/references/upload', '/api/references/delete'):
                if not self.user() or self.headers.get('X-WalletFreak') != '1':
                    return self.respond(403, {'error': 'Reference changes require the private browser session.'})
                docs = self.server.store.documents
                result = docs.upload(body) if self.path.endswith('/upload') else docs.delete(body)
            elif self.path.startswith('/api/spending/'):
                if not self.user() or self.headers.get('X-WalletFreak') != '1':
                    return self.respond(403, {'error': 'Spending changes require the private browser session.'})
                result = self.server.store.spending.action(self.path.rsplit('/', 1)[1], body)
            elif self.path.startswith('/api/vault/'):
                if not self.user() or self.headers.get('X-WalletFreak') != '1':
                    return self.respond(403, {'error':'Vault changes require the private browser session.'})
                result = self.server.store.vault.action(self.path.rsplit('/',1)[1], body, self.session())
            elif self.path == '/api/onboarding':
                if not self.user() or self.headers.get('X-WalletFreak') != '1':
                    return self.respond(403, {'error':'Dashboard setup requires the private browser session.'})
                result = self.server.store.user_action('onboarding', body)
            elif self.path.startswith('/api/agent/'):
                if not self.agent():
                    return self.respond(403, {'error': 'Agent authentication required.'})
                result = self.server.store.agent_action(self.path.rsplit('/', 1)[1], body)
            else:
                if not (self.user() or self.agent()) or self.headers.get('X-WalletFreak') != '1':
                    return self.respond(403, {'error': 'Authenticated local action required.'})
                if self.path == '/api/stop':
                    self.respond(200, {'message': 'Dashboard stopped. Saved trips remain on this device.'})
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                    return
                if not self.path.startswith('/api/'):
                    return self.respond(404, {'error': 'Not found.'})
                result = self.server.store.user_action(self.path.removeprefix('/api/'), body)
            self.respond(200, result)
        except (ValueError, TypeError, KeyError, OverflowError) as error:
            self.respond(400, {'error': str(error)})
        except OSError:
            self.respond(500, {'error': 'Local data could not be saved. Check disk access before retrying.'})


class LocalServer(HTTPServer):
    def service_actions(self):
        self.store.vault.status(None)  # Expire unlocks even after all browser tabs close.


def serve(root, port):
    with exclusive(root / 'server.lock'):
        try:
            server = LocalServer(('127.0.0.1', port), Handler)
        except OSError:
            server = LocalServer(('127.0.0.1', 0), Handler)
        server.authority = f'127.0.0.1:{server.server_port}'
        server.origin = 'http://' + server.authority
        server.agent_token, server.ui_token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        server.sessions = set()
        server.store = Store(root)
        descriptor = {'origin': server.origin, 'agent_token': server.agent_token, 'ui_token': server.ui_token}
        atomic_json(root / 'server.json', descriptor)
        try:
            server.serve_forever(poll_interval=0.25)
        finally:
            server.store.vault.lock()
            server.server_close()
            if read_json(root / 'server.json') == descriptor:
                (root / 'server.json').unlink()


def call(root, route, body=None):
    descriptor = read_json(root / 'server.json')
    if not descriptor or not re.fullmatch(r'http://127\.0\.0\.1:\d+', descriptor.get('origin', '')):
        raise ValueError('Start the local dashboard first.')
    headers = {'Authorization': 'Bearer ' + descriptor['agent_token'], 'X-WalletFreak': '1'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = Request(descriptor['origin'] + route, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with urlopen(request, timeout=5) as response:
            return json.load(response)
    except HTTPError as error:
        raise ValueError(json.load(error).get('error', 'Local request failed.')) from None


def start(root, port):
    with exclusive(root / 'launcher.lock'):
        try:
            health = call(root, '/api/health')
        except (ValueError, OSError, URLError):
            health = {}
        if health.get('application') == 'walletfreak':
            descriptor = read_json(root / 'server.json')
            if health.get('plugin_root') == str(PLUGIN) and health.get('ready'):
                return descriptor
            # Plugin upgrades can remove the old server's cached assets.
            call(root, '/api/stop', {})
            deadline = time.monotonic() + 10
            while read_json(root / 'server.json') == descriptor:
                if time.monotonic() >= deadline:
                    raise ValueError('The previous dashboard did not stop. Saved data has been retained.')
                time.sleep(0.1)
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'serve', '--port', str(port)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                health = call(root, '/api/health')
            except (ValueError, OSError, URLError):
                health = {}
            if health.get('application') == 'walletfreak' and health.get('plugin_root') == str(PLUGIN):
                if not health.get('ready'):
                    call(root, '/api/stop', {})
                    raise ValueError('Dashboard files are missing. Reinstall the current plugin; saved data has been retained.')
                return read_json(root / 'server.json')
            if process.poll() is not None:
                raise ValueError('Dashboard failed to start. Run the serve command to inspect the local error.')
            time.sleep(0.1)
    raise ValueError('Dashboard did not become ready.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('start', 'serve', 'status', 'publish', 'wallet-sync', 'wallet', 'refresh-requests', 'refresh-complete', 'settings', 'forget', 'stop', 'references', 'extract-references', 'insights', 'shopping', 'shopping-publish', 'layout', 'catalog'))
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--view', choices=('travel', 'wallet', 'credit-cards', 'spending', 'shopping'), default='travel', help='Private dashboard view to open with start.')
    parser.add_argument('--trip', help='Saved trip ID for a direct Travel link.')
    parser.add_argument('--review', choices=('comparison', 'research'), help='Open the selected trip at its comparison or research section.')
    parser.add_argument('--input', type=Path, help='JSON findings or local settings; use - for stdin. Never supply credentials.')
    args = parser.parse_args()
    try:
        root = data_directory()
        if args.command == 'serve':
            serve(root, args.port)
            return
        if args.command == 'start':
            if (args.trip or args.review) and args.view != 'travel':
                raise ValueError('Trip review links use the Travel view.')
            if args.review and not args.trip:
                raise ValueError('Provide --trip for a direct review link.')
            if args.trip:
                Store(root).trip(args.trip)
            descriptor = start(root, args.port)
            query = urlencode({key:value for key,value in (('trip',args.trip),('review',args.review)) if value})
            print(descriptor['origin'] + '/' + ('wallet' if args.view == 'credit-cards' else args.view) + ('?' + query if query else '') + '#key=' + descriptor['ui_token'])
            return
        if args.command in ('publish', 'settings', 'forget', 'insights', 'wallet-sync', 'refresh-complete', 'extract-references', 'shopping-publish') or args.command == 'layout' and args.input:
            if not args.input:
                raise ValueError('Provide --input with a JSON file or - for stdin.')
            body = json.load(sys.stdin) if str(args.input) == '-' else read_json(args.input)
            route = '/api/agent/' + args.command if args.command in ('publish', 'insights', 'wallet-sync', 'refresh-complete', 'extract-references', 'shopping-publish') else '/api/' + args.command
            result = call(root, route, body)
        elif args.command in ('layout','catalog'):
            result = call(root, '/api/' + args.command)
        elif args.command == 'shopping':
            result = call(root, '/api/shopping')
        elif args.command == 'references':
            result = call(root, '/api/references')
        elif args.command == 'wallet':
            result = Store(root).wallet()
        elif args.command == 'refresh-requests':
            result = Store(root).refresh_requests()
        elif args.command == 'stop':
            result = call(root, '/api/stop', {})
        else:
            result = call(root, '/api/state')
            result.pop('wallet', None)  # Results commands never print private wallet balances.
        print(json.dumps(result, indent=2, allow_nan=False))
    except (OSError, ValueError, URLError) as error:
        parser.exit(1, f'WalletFreak: {error}\n')


if __name__ == '__main__':
    main()
