from copy import deepcopy
from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'plugins/walletfreak/scripts'))
import local
import vault
import signin

class WalletRoutes(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.store=local.Store(self.root)
    def old_wallet(self):
        return {'version':1,'revision':'old','cards':[{'name':'Example','owner':'Alex','notes':'keep','reported_on':'2026-10-01'}],'programs':[{'name':'Rewards','owner':'Alex','balance':'12345','approximate':True,'status':'Silver','preserve':True,'reported_on':'2026-10-01','notes':'Keep points'}],'benefits':[],'preferences':'Keep this'}
    def test_migration_linking_sync_and_delete(self):
        old=self.old_wallet();local.atomic_json(self.root/'wallet.json',old)
        current=self.store.wallet();self.assertEqual(local.read_json(self.root/'wallet-v1-backup.json'),old)
        self.assertEqual(current,self.store.wallet());self.assertEqual(current['people'][0]['name'],'Alex')
        self.assertEqual(current['programs'][0]['balance'],'12345')
        draft=deepcopy({k:v for k,v in current.items() if k not in ('version','revision')});draft['cards'][0]['reward_account_id']=draft['programs'][0]['id']
        local.validate_wallet(draft)
        bad=deepcopy(draft);bad['cards'][0]['reward_account_id']='gone'
        with self.assertRaises(ValueError):local.validate_wallet(bad)
        body={'expected_revision':current['revision'],'updates':[{'program_id':current['programs'][0]['id'],'person_id':current['people'][0]['id'],'balance':'0','observed_at':'2026-10-19T10:00:00-04:00','source_url':'https://example.com/rewards?token=secret'}]}
        bad=deepcopy(body);bad['updates'][0]['person_id']='wrong'
        with self.assertRaises(ValueError):self.store.agent_action('wallet-sync',bad)
        self.assertEqual(self.store.wallet(),current)
        self.store.agent_action('wallet-sync',body);updated=self.store.wallet()
        self.assertEqual(updated['programs'][0]['balance'],'0');self.assertEqual(updated['programs'][0]['notes'],'Keep points');self.assertEqual(updated['programs'][0]['sync_source'],'https://example.com/rewards')
        with self.assertRaises(ValueError):self.store.agent_action('wallet-sync',body)
        self.store.user_action('delete-wallet',{'expected_revision':updated['revision']});self.assertFalse((self.root/'wallet-v1-backup.json').exists())
    def test_optional_account_identity_preserves_legacy_values(self):
        old=self.old_wallet();local.atomic_json(self.root/'wallet.json',old)
        current=self.store.wallet();draft={k:v for k,v in current.items() if k not in ('version','revision')}
        draft['programs'][0].update(account_label='Alex rewards',member_hint='1234',credential_id='a'*32)
        result=self.store.user_action('wallet',{'wallet':draft,'expected_revision':current['revision']})['wallet']
        self.assertEqual(result['programs'][0]['balance'],'12345');self.assertEqual(result['programs'][0]['reported_on'],'2026-10-01')
        self.assertEqual(result['programs'][0]['credential_id'],'a'*32)
        linked=deepcopy(draft);linked['cards'][0]['credential_id']='b'*32
        local.validate_wallet(linked)
        bad=deepcopy(draft);bad['cards'][0]['credential_id']='not-an-id'
        with self.assertRaises(ValueError):local.validate_wallet(bad)
        bad=deepcopy(draft);bad['programs'][0]['credential_id']='not-an-id'
        with self.assertRaises(ValueError):local.validate_wallet(bad)
    def test_refresh_requests_are_account_scoped_and_cleared_after_sync(self):
        local.atomic_json(self.root/'wallet.json',self.old_wallet())
        wallet=self.store.wallet();draft={k:v for k,v in wallet.items() if k not in ('version','revision')}
        draft['programs'][0]['credential_id']='a'*32
        draft['cards'][0]['credential_id']='b'*32
        wallet=self.store.user_action('wallet',{'wallet':draft,'expected_revision':wallet['revision']})['wallet']
        program=wallet['programs'][0];card=wallet['cards'][0]
        with self.assertRaises(ValueError):self.store.user_action('refresh-account',{'section':'programs','id':'missing'})
        self.store.user_action('refresh-account',{'section':'programs','id':program['id']})
        self.store.user_action('refresh-account',{'section':'cards','id':card['id']})
        self.assertEqual(len(self.store.refresh_requests()['requests']),2)
        self.store.agent_action('wallet-sync',{'expected_revision':wallet['revision'],'updates':[{'program_id':program['id'],'person_id':program['person_id'],'balance':'42000','observed_at':'2026-10-19T10:00:00-04:00','source_url':'https://example.com/rewards'}]})
        self.assertEqual(len(self.store.refresh_requests()['requests']),2)
        self.store.agent_action('refresh-complete',{'section':'programs','id':program['id']})
        self.assertEqual(self.store.refresh_requests()['requests'][0]['section'],'cards')
        self.store.agent_action('refresh-complete',{'section':'cards','id':card['id']})
        self.assertEqual(self.store.refresh_requests()['requests'],[])
        self.store.user_action('refresh-account',{'section':'cards','id':card['id']})
        current=self.store.wallet();draft={k:v for k,v in current.items() if k not in ('version','revision')}
        draft['cards'][0]['credential_id']=''
        self.store.user_action('wallet',{'wallet':draft,'expected_revision':current['revision']})
        self.assertEqual(self.store.refresh_requests()['requests'],[])
    def test_routes_validation_and_export_escape(self):
        data={'title':'Demo','generated_at':'2026-10-19T12:00:00Z','options':[],'itinerary':[{'when':'Local time TBD','title':'Stay','detail':'</script><script>alert(1)</script>','stay':{'check_in':'2027-01-01','check_out':'2027-01-03'},'place':{'label':'Public place','lat':0,'lng':0,'confidence':'approximate','source_url':'https://example.com/?secret=TOKEN'},'route':{'mode':'train'}}]}
        local.board.validate(data);html=local.board.render(data);self.assertNotIn('TOKEN',html);self.assertNotIn('</script><script>alert(1)',html)
        for patcher in (lambda x:x['place'].update(lat=float('nan')),lambda x:x['stay'].update(check_out='2026-12-31'),lambda x:x['route'].update(duration='10 minutes')):
            bad=deepcopy(data);patcher(bad['itinerary'][0])
            with self.assertRaises(ValueError):local.board.validate(bad)
    @unittest.skipIf(vault.AESGCM is None,'cryptography required')
    def test_device_signin_restart_and_origin_restriction(self):
        with patch('vault.device_key',return_value=b'x'*32):
            v=self.store.vault;v.action('device',{},'browser')
            result=v.action('save',{'provider':'Example','label':'Alex','username':'test-user','password':'secret-test-only','login_origin':'https://login.example.com','expected_revision':v.revision},'browser')
            self.assertNotIn('secret-test-only',v.path.read_text());self.assertNotIn('password',json.dumps(result))
            reopened=signin.saved_vault(self.root,local.read_json,local.atomic_json);entry=reopened.payload['entries'][0]
            code=signin.fill_code(entry,{'credential_id':entry['id'],'password_selector':'#password'})
            self.assertIn('https://login.example.com',code);self.assertIn("el.type!=='password'",code)
            with self.assertRaises(ValueError):signin.fill_code({**entry,'login_origin':'http://evil.test'}, {'password_selector':'#p'})
            self.assertNotIn('secret-test-only',json.dumps(signin.redact({'text':code},['secret-test-only'])))

if __name__=='__main__':unittest.main()
