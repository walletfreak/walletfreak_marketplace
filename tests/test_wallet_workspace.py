"""Synthetic data only: vault isolation, legacy import, plugin browsing and payment output."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'plugins/walletfreak/scripts'))
import local
import vault
import inventory
from profile_import import parse_profile

PROFILE='''# WalletFreak traveler profile
## Travel preferences
- Preserve Example Bank points.
## Credit cards
| Alias | Product | Country | Holder | Shared | Enrollment | Reported |
| --- | --- | --- | --- | --- | --- | --- |
| Travel | Example Travel Card | Unknown | Traveler A | Shared | Unknown | 2026-10-01 |
## Points and miles
| Program | Holder | Balance | Preference | Reported |
| --- | --- | --- | --- | --- |
| Example Bank | Traveler A | About 12,345 | Prefer to preserve | 2026-10-01 |
| Example Pool | Family pool | Unknown | Pooling restrictions unverified | 2026-10-01 |
## Certificates
| Name | Holder | Count | Expiry | Restrictions | Reported |
| --- | --- | --- | --- | --- | --- |
| Hotel night | Traveler A | 2 | Unknown | Eligible inventory unverified | 2026-10-01 |
## Travel credits and passes
| Program | Credit | Amount | Period | Details | Reported |
| --- | --- | --- | --- | --- | --- |
| Example Airline | Gift cards | USD 40 | Expiry unknown | Count unknown | 2026-10-01 |
| Example Airline | Travel credit | Amount and type unknown | Unknown | Not known to be TravelBank | 2026-10-01 |
'''

class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'local';self.root.mkdir()
        self.store=local.Store(self.root)

    def test_onboarding_starts_only_for_fresh_data_and_remembers_completion(self):
        self.assertTrue(self.store.snapshot()['onboarding']['show'])
        self.store.user_action('onboarding', {'state':'started'})
        catalog=self.store.layouts.state()
        self.store.layouts.save({'expected_revision':catalog['revision'],'layout':catalog['layout']})
        self.assertTrue(local.Store(self.root).snapshot()['onboarding']['show'])
        self.store.user_action('onboarding', {'state':'complete'})
        self.assertFalse(local.Store(self.root).snapshot()['onboarding']['show'])
        with self.assertRaises(ValueError):self.store.user_action('onboarding', {'state':'invalid'})
        other=self.root.parent/'existing';other.mkdir()
        existing=local.Store(other)
        existing.layouts.save({'expected_revision':'empty','layout':existing.layouts.state()['layout']})
        self.assertFalse(existing.snapshot()['onboarding']['show'])

    def test_import_preserves_dates_unknowns_and_original_and_rejects_overwrite(self):
        path=self.root.parent/'traveler-profile.md';path.write_text(PROFILE)
        self.assertTrue(self.store.snapshot()['legacy_profile'])
        self.store.user_action('import-profile',{'expected_revision':'empty'})
        wallet=self.store.wallet()
        self.assertEqual(wallet['programs'][0]['balance'],'12345')
        self.assertTrue(wallet['programs'][0]['approximate']);self.assertTrue(wallet['programs'][0]['preserve'])
        self.assertEqual(wallet['programs'][1]['balance'],'')
        self.assertEqual(wallet['programs'][1]['owner'],'Family pool')
        self.assertIn('Pooling restrictions',wallet['programs'][1]['notes'])
        self.assertEqual(wallet['cards'][0]['reported_on'],'2026-10-01')
        self.assertEqual(wallet['benefits'][0]['expires_on'],'')
        self.assertEqual(wallet['benefits'][1]['kind'],'gift-card')
        self.assertEqual(wallet['benefits'][2]['kind'],'travel-credit')
        self.assertEqual(path.read_text(),PROFILE)
        with self.assertRaises(ValueError):self.store.user_action('import-profile',{'expected_revision':wallet['revision']})
        self.assertEqual(self.store.wallet(),wallet)
        self.store.user_action('delete-wallet',{'expected_revision':wallet['revision']})
        self.assertEqual(self.store.wallet(),local.empty_wallet())
        self.assertEqual(path.read_text(),PROFILE)

    def test_extended_assets_and_old_wallet_compatibility(self):
        data=parse_profile(PROFILE)
        data['cards'][0]['nickname']='Everyday card';local.validate_wallet(data)
        data['cards'][0].pop('nickname');local.validate_wallet(data)
        data['cards'][0]['nickname']='x'*301
        with self.assertRaises(ValueError):local.validate_wallet(data)
        data['cards'][0].pop('nickname')
        for kind in ('travel-bank','gift-card','companion','upgrade','lounge-pass','membership','voucher','cashback','other'):
            data['benefits'][0]['kind']=kind;local.validate_wallet(data)
        data['programs'][0].pop('notes');local.validate_wallet(data)
        data['programs'][0]['password']='secret'
        with self.assertRaises(ValueError):local.validate_wallet(data)
        with self.assertRaises(ValueError):parse_profile('No supported tables')

    def test_plugin_content_is_scoped_and_never_executed(self):
        root=self.root/'plugin';skill=root/'skills/example';skill.mkdir(parents=True)
        (skill/'SKILL.md').write_text('---\nname: example\ndescription: >\n  A folded\n  description.\n---\n<script>not executed</script>')
        external=self.root/'private.md';external.write_text('private')
        bad=root/'skills/private';bad.mkdir();(bad/'SKILL.md').symlink_to(external)
        result=inventory.package(root,'example','1')
        self.assertEqual(len(result['skills']),1)
        self.assertEqual(result['skills'][0]['description'],'A folded description.')
        self.assertNotIn('private',json.dumps(result))


@unittest.skipIf(vault.AESGCM is None,'Optional vault dependency not installed')
class VaultTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.store=local.Store(self.root);self.v=self.store.vault
        self.password='synthetic master password only'
        self.v.action('create',{'master_password':self.password},'browser-A')

    def test_device_signin_json_has_no_plaintext_and_agent_can_decrypt(self):
        root=self.root/'device';root.mkdir()
        saved=local.Store(root).vault
        with patch('vault.device_key', return_value=b'x'*32):
            saved.action('device',{},'browser-A')
            result=saved.action('save',{'provider':'Example','label':'Personal','username':'person@example.com','password':'synthetic secret','login_origin':'https://example.com','expected_revision':saved.revision},'browser-A')
            self.assertNotIn('synthetic secret',saved.path.read_text())
            self.assertNotIn('password',json.dumps(result))
            reopened=local.Store(root).vault
            reopened.open_device('agent')
            self.assertEqual(reopened.payload['entries'][0]['password'],'synthetic secret')

    def save(self,password=' synthetic provider password '):
        return self.v.action('save',{'provider':'Example','label':'Synthetic','username':'synthetic@example.invalid','password':password,'expected_revision':self.v.revision},'browser-A')

    def test_ciphertext_and_separate_browser_authorization(self):
        result=self.save();raw=self.v.path.read_text()
        for secret in (self.password,'synthetic@example.invalid','synthetic provider password','Example'):
            self.assertNotIn(secret,raw)
        self.assertNotIn('password',json.dumps(result))
        self.assertNotIn('synthetic@example.invalid',json.dumps(self.store.snapshot()))
        self.assertFalse(self.v.status('browser-B')['unlocked'])
        self.assertEqual(self.v.status('browser-B')['entries'],[])
        with self.assertRaises(ValueError):self.v.action('delete',{'id':result['entries'][0]['id'],'expected_revision':self.v.revision},'browser-B')
        self.v.lock();self.v.action('unlock',{'master_password':self.password},'browser-A')
        self.assertEqual(self.v.payload['entries'][0]['password'],' synthetic provider password ')
        self.assertEqual(self.v.path.stat().st_mode & 0o777,0o600)

    def test_bad_password_tamper_timeout_and_restart(self):
        self.save();self.v.lock()
        with self.assertRaises(ValueError):self.v.action('unlock',{'master_password':'incorrect password'},'browser-A')
        self.assertFalse(self.v.status('browser-A')['unlocked']);self.v.retry_after=0
        self.v.action('unlock',{'master_password':self.password},'browser-A')
        self.v.touched=time.monotonic()-901
        self.assertFalse(self.v.status('browser-A')['unlocked']);self.assertIsNone(self.v.key)
        self.assertFalse(local.Store(self.root).vault.status('browser-A')['unlocked'])
        envelope=local.read_json(self.v.path);encrypted=bytearray(vault.decode(envelope['ciphertext']));encrypted[-1]^=1;envelope['ciphertext']=vault.encode(encrypted);local.atomic_json(self.v.path,envelope)
        with self.assertRaises(ValueError):self.v.action('unlock',{'master_password':self.password},'browser-A')
        self.assertIsNone(self.v.key)

    def test_disk_failure_stale_edit_and_deletion(self):
        result=self.save();old=self.v.path.read_bytes();payload=deepcopy(self.v.payload)
        with patch.object(self.v,'write',side_effect=OSError('disk full')):
            with self.assertRaises(OSError):self.save('changed')
        self.assertEqual(self.v.path.read_bytes(),old);self.assertEqual(self.v.payload,payload)
        with self.assertRaises(ValueError):self.v.action('save',{'expected_revision':'old'},'browser-A')
        self.v.action('delete',{'id':result['entries'][0]['id'],'expected_revision':self.v.revision},'browser-A')
        self.assertEqual(self.v.status('browser-A')['entries'],[])
        with self.assertRaises(ValueError):self.v.action('create',{'master_password':self.password},'browser-A')
        self.assertTrue(self.v.path.exists())

    def test_clear_signins_requires_confirmation_and_current_revision(self):
        self.save(); self.save('second synthetic password')
        with self.assertRaises(ValueError): self.v.action('clear',{'confirm':'wrong','expected_revision':self.v.revision},'browser-A')
        with self.assertRaises(ValueError): self.v.action('clear',{'confirm':'clear-all-sign-ins','expected_revision':'stale'},'browser-A')
        self.assertEqual(len(self.v.status('browser-A')['entries']),2)
        self.v.action('clear',{'confirm':'clear-all-sign-ins','expected_revision':self.v.revision},'browser-A')
        self.assertEqual(self.v.status('browser-A')['entries'],[])
        self.assertNotIn('second synthetic password',self.v.path.read_text())


if __name__=='__main__':unittest.main()
