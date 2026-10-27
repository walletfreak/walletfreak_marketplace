"""Password-encrypted local credentials. No secret-reading HTTP or CLI endpoint."""
import base64
from copy import deepcopy
import json
import os
import time
import uuid
from urllib.parse import urlsplit
from device_key import device_key

try:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
except ImportError:
    AESGCM = None

AAD = b'WalletFreak credential vault v1'
IDLE_SECONDS = 900


def encode(value):
    return base64.b64encode(value).decode('ascii')


def decode(value):
    return base64.b64decode(value, validate=True)


class Vault:
    def __init__(self, root, read, write):
        self.path = root / 'credentials.enc.json'
        self.read, self.write = read, write
        self.key = self.salt = self.payload = self.revision = None
        self.owner = None
        self.device = False
        self.touched = self.retry_after = 0

    def lock(self):
        self.key = self.salt = self.payload = self.revision = self.owner = None
        self.touched = 0

    def status(self, owner):
        if self.key and (time.monotonic() - self.touched > IDLE_SECONDS or not self.path.exists()):
            self.lock()
        envelope = self.read(self.path) if owner is not None else None
        is_device = (envelope or {}).get('version') == 2
        if owner is not None and is_device and (not self.key or self.owner != owner):
            self.open_device(owner)
        unlocked = bool(self.key and self.owner == owner)
        return {'supported': AESGCM is not None, 'exists': self.path.exists(), 'unlocked': unlocked,
                'device':is_device, 'revision': self.revision if unlocked else None,
                'entries': [{k: row.get(k,'') for k in ('id', 'provider', 'label', 'username', 'login_origin')} for row in self.payload['entries']] if unlocked else []}

    def open_device(self, owner, create=False):
        if AESGCM is None: raise ValueError('Install requirements-vault.txt to save sign-ins.')
        envelope = self.read(self.path)
        if envelope and envelope.get('version') != 2:
            raise ValueError('Unlock your existing vault once in Sign-ins, then choose Use device sign-in.')
        if not envelope and not create: raise ValueError('Add a sign-in in your local dashboard first.')
        key = device_key(self.path.parent, create=not envelope)
        if envelope:
            try: payload = json.loads(AESGCM(key).decrypt(decode(envelope['nonce']), decode(envelope['ciphertext']), AAD))
            except (InvalidTag, ValueError, KeyError): raise ValueError('Could not open saved sign-ins. Original file retained.') from None
        else: payload = {'entries':[]}
        self.key, self.salt, self.payload, self.owner, self.device = key, b'', payload, owner, True
        self.revision = envelope['revision'] if envelope else None
        self.touched = time.monotonic()
        if not envelope: self.persist(payload)

    def derive(self, password, salt):
        if AESGCM is None:
            raise ValueError('Install the credential-vault dependency from requirements-vault.txt.')
        if not isinstance(password, str) or not 12 <= len(password) <= 1024:
            raise ValueError('Use a master password of 12–1024 characters.')
        return Scrypt(salt=salt, length=32, n=2**17, r=8, p=1).derive(password.encode())

    def persist(self, payload):
        current = self.read(self.path)
        if (current or {}).get('revision') != self.revision:
            self.lock()
            raise ValueError('The vault changed elsewhere. Unlock it again before editing.')
        revision = uuid.uuid4().hex
        nonce = os.urandom(12)
        encrypted = AESGCM(self.key).encrypt(nonce, json.dumps(payload).encode(), AAD)
        self.write(self.path, {'version':2 if self.device else 1, 'revision':revision, 'salt':encode(self.salt), 'nonce':encode(nonce), 'ciphertext':encode(encrypted)})
        self.revision, self.payload, self.touched = revision, payload, time.monotonic()

    def action(self, action, body, owner):
        from local import fields, short_text
        if action == 'device':
            fields(body, ())
            self.open_device(owner, create=True)
        elif action == 'migrate-device':
            fields(body, ())
            if not self.status(owner)['unlocked']: raise ValueError('Unlock the old vault once to migrate it.')
            key = device_key(self.path.parent, create=True)
            self.key, self.device = key, True
            self.persist(self.payload)
        elif action in ('create', 'unlock'):
            fields(body, ('master_password',), ('master_password',))
            if time.monotonic() < self.retry_after:
                raise ValueError('Wait a few seconds before trying to unlock again.')
            if AESGCM is None:
                raise ValueError('Install the credential-vault dependency from requirements-vault.txt.')
            self.lock()
            self.device = False
            envelope = self.read(self.path)
            if action == 'create':
                if envelope is not None:
                    raise ValueError('A vault already exists. Unlock it instead.')
                salt = os.urandom(16)
                key = self.derive(body['master_password'], salt)
                self.key, self.salt, self.owner = key, salt, owner
                try:
                    self.persist({'entries':[]})
                except Exception:
                    self.lock()
                    raise
            else:
                if envelope is None:
                    raise ValueError('Create a vault first.')
                try:
                    if envelope['version'] != 1:
                        raise ValueError('Unsupported vault version.')
                    salt, nonce = decode(envelope['salt']), decode(envelope['nonce'])
                    if len(salt) != 16 or len(nonce) != 12:
                        raise ValueError('Invalid vault data.')
                    key = self.derive(body['master_password'], salt)
                    payload = json.loads(AESGCM(key).decrypt(nonce, decode(envelope['ciphertext']), AAD))
                    if not isinstance(payload.get('entries'), list):
                        raise ValueError('Invalid vault data.')
                except (InvalidTag, ValueError, KeyError, TypeError):
                    self.retry_after = time.monotonic() + 3
                    raise ValueError('Could not unlock. Check the master password; preserve the file if it may be damaged.') from None
                self.key, self.salt, self.payload, self.revision, self.owner = key, salt, payload, envelope['revision'], owner
                self.touched = time.monotonic()
        elif action == 'lock':
            fields(body, ())
            if self.owner not in (None, owner):
                raise ValueError('This vault is unlocked in another browser session.')
            self.lock()
        else:
            if not self.status(owner)['unlocked']:
                raise ValueError('Unlock the vault in this browser session first.')
            if body.get('expected_revision') != self.revision:
                raise ValueError('Saved sign-ins changed. Refresh the vault list before editing.')
            payload = deepcopy(self.payload)
            if action == 'save':
                fields(body, ('id', 'provider', 'label', 'username', 'password', 'expected_revision', 'login_origin'), ('provider', 'label', 'username', 'password', 'expected_revision'))
                row = {k: short_text(body[k], k, k in ('provider','username'), 300) for k in ('provider','label','username')}
                # Password whitespace is significant and must survive unchanged.
                if not isinstance(body['password'], str) or not 1 <= len(body['password']) <= 4096:
                    raise ValueError('Enter a password of 1–4096 characters.')
                row['password'] = body['password']
                origin = body.get('login_origin','')
                if origin:
                    parsed = urlsplit(origin)
                    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment:
                        raise ValueError('Use the exact HTTPS login origin, such as https://accounts.example.com, with no path.')
                    row['login_origin'] = origin.rstrip('/')
                if body.get('id'):
                    index = next((i for i,e in enumerate(payload['entries']) if e['id'] == body['id']), None)
                    if index is None: raise ValueError('Saved sign-in no longer exists.')
                    row['id'] = body['id']; payload['entries'][index] = row
                else:
                    if len(payload['entries']) >= 200: raise ValueError('The vault supports up to 200 sign-ins.')
                    row['id'] = uuid.uuid4().hex; payload['entries'].append(row)
            elif action == 'delete':
                fields(body, ('id','expected_revision'), ('id','expected_revision'))
                rows = [e for e in payload['entries'] if e['id'] != body['id']]
                if len(rows) == len(payload['entries']): raise ValueError('Saved sign-in no longer exists.')
                payload['entries'] = rows
            elif action == 'clear':
                fields(body, ('confirm','expected_revision'), ('confirm','expected_revision'))
                if body['confirm'] != 'clear-all-sign-ins': raise ValueError('Confirm clearing all saved sign-ins.')
                payload['entries'] = []
            else:
                raise ValueError('Unknown vault action.')
            self.persist(payload)
        return self.status(owner)
