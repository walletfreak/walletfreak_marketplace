import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'plugins/walletfreak-spending/scripts/spending.py'


class SpendingCLI(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def run_command(self, command, body=None, *arguments):
        return subprocess.run([sys.executable,str(SCRIPT),'--directory',str(self.root/'ledger'),command,*arguments],input=json.dumps(body),text=True,capture_output=True)

    def test_review_roundtrip_and_export_refuses_overwrite(self):
        request={'import':{'content':'Date,Description,Amount\n2026-11-01,Cafe,12.34\n','filename':'activity.csv','bank':'Other','account':'A','currency':'USD','sign':'positive'}}
        preview=self.run_command('preview',request)
        self.assertEqual(preview.returncode,0,preview.stderr)
        self.assertFalse((self.root/'ledger/spending.json').exists())
        request['expected_revision']='empty'
        imported=self.run_command('import',request)
        self.assertEqual(imported.returncode,0,imported.stderr)
        state=json.loads(imported.stdout)
        self.assertEqual(state['totals'],[])
        change={'expected_revision':state['revision'],'changes':[{'id':state['rows'][0]['id'],'category':'Dining','type':'expense','review':'approved'}]}
        reviewed=self.run_command('update',change)
        self.assertEqual(reviewed.returncode,0,reviewed.stderr)
        self.assertEqual(json.loads(reviewed.stdout)['totals'][0]['net_spending'],'12.34')
        output=self.root/'summary.csv'
        exported=self.run_command('export',None,'--summary','--output',str(output))
        self.assertEqual(exported.returncode,0,exported.stderr)
        original=output.read_bytes()
        self.assertIn(b'2026-11,USD,Dining,12.34',original)
        self.assertNotEqual(self.run_command('export',None,'--output',str(output)).returncode,0)
        self.assertEqual(output.read_bytes(),original)

    def test_symlink_and_stale_changes_preserve_files(self):
        ledger=self.root/'ledger'
        ledger.mkdir(mode=0o700)
        original=self.root/'private.json'
        original.write_text('{"version":1,"revision":"original","imports":[],"rows":[]}')
        (ledger/'spending.json').symlink_to(original)
        result=self.run_command('snapshot')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('symlink',result.stderr)
        self.assertEqual(json.loads(original.read_text())['revision'],'original')
        (ledger/'spending.json').unlink()
        (ledger/'spending.json').write_bytes(original.read_bytes())
        result=self.run_command('delete',{'expected_revision':'stale','confirm':'delete-spending'})
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((ledger/'spending.json').read_bytes(),original.read_bytes())

    @unittest.skipIf(sys.platform == 'win32', 'POSIX permissions')
    def test_existing_shared_directory_is_not_modified(self):
        ledger=self.root/'ledger'
        ledger.mkdir(mode=0o755)
        result=self.run_command('snapshot')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('owner-only',result.stderr)
        self.assertEqual(ledger.stat().st_mode & 0o777,0o755)
        self.assertEqual(list(ledger.iterdir()),[])


if __name__=='__main__': unittest.main()
