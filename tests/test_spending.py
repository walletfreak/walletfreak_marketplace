import csv
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'plugins/walletfreak-spending/scripts'))
import spending


def source(content='Transaction Date,Description,Category,Type,Amount\n10/01/2026,Cafe,Dining,Sale,-12.34\n10/02/2026,Payment Thank You,,Payment,30\n10/03/2026,Refund,Dining,Return,2.34\n', **changes):
    return dict(content=content, filename='activity.csv', bank='Chase', account='Personal card', currency='USD', sign='negative', **changes)


class Spending(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = spending.Ledger(Path(self.temp.name), spending.read_json, spending.atomic_json)
    def tearDown(self):
        self.temp.cleanup()
    def add(self, value=None):
        return self.ledger.action('import', {'import': value or source(), 'expected_revision': self.ledger.state()['revision']})
    def approve(self, state):
        return self.ledger.action('update', {'expected_revision':state['revision'], 'changes':[dict(id=r['id'],category=r['category'],type=r['type'],review='approved') for r in state['rows']]})
    def test_bank_shapes_signs_refunds_payments_and_decimal_totals(self):
        state=self.add()
        self.assertEqual([r['amount'] for r in state['rows']], ['12.34','-30.00','-2.34'])
        self.assertEqual([r['type'] for r in state['rows']], ['expense','payment','refund'])
        self.assertEqual(state['totals'], [])
        self.assertEqual(self.approve(state)['totals'],[dict(month='2026-10',currency='USD',category='Dining',net_spending='10.00')])
        for bank, contents, sign in [
            ('Citi','Status,Date,Description,Debit,Credit\nPosted,10/01/2026,Shop,12.34,\nPosted,10/02/2026,Return,,2.34','positive'),
            ('Capital One','Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n2026-10-01,2026-10-02,1234,Shop,Shopping,12.34,\n2026-10-02,2026-10-03,1234,Return,Shopping,,2.34','negative'),
            ('Amex','Date,Description,Amount\n10/01/2026,Shop,12.34\n10/02/2026,Return,-2.34','positive')]:
            value=source();value.update(bank=bank,content=contents,sign=sign)
            parsed=spending.parse(value);self.assertFalse(parsed['errors']);self.assertEqual([r['amount'] for r in parsed['rows']],['12.34','-2.34']);self.assertEqual(parsed['rows'][1]['type'],'unknown')
    def test_duplicate_reimports_overlaps_and_same_day_purchases(self):
        value=source();value['content']+='10/01/2026,Cafe,Dining,Sale,-12.34\n'
        state=self.add(value);self.assertEqual(len(state['rows']),4)
        with self.assertRaisesRegex(ValueError,'already imported'):self.add(value)
        overlap=source();overlap['content']+='10/04/2026,Hotel,Travel,Sale,-100\n'
        state=self.add(overlap);self.assertEqual(sum(r['possible_duplicate'] for r in state['rows']),3)
        self.assertTrue(all(r['review']=='needs-review' for r in state['rows']))
    def test_invalid_rows_fail_entire_import_without_data_loss(self):
        self.add();before=self.ledger.path.read_bytes()
        for row in ('10/02/2026,Bad,Dining,Sale,NaN','10/02/2026,Bad,Dining,Sale,1.234','13/02/2026,Bad,Dining,Sale,12','10/02/2026,Short'):
            value=source();value['content']+='\n'+row
            with self.assertRaises(ValueError):self.add(value)
            self.assertEqual(before,self.ledger.path.read_bytes())
        value=source();value['filename']='statement.pdf'
        with self.assertRaisesRegex(ValueError,'transaction CSV'):spending.parse(value)
        value=source();value['content']='Date,Description,Amount\n2026-10-01,"bad,1'
        with self.assertRaisesRegex(ValueError,'Malformed CSV'):spending.parse(value)
    def test_custom_mapping_unknown_headers_and_currency_isolation(self):
        value=source();value.update(sign='positive',content='When,Merchant name,Total,Unit,Group\n2026-10-01,Cafe,1.10,USD,Dining\n2026-10-02,Cafe,2.20,EUR,Dining',mapping={'date':'When','description':'Merchant name','amount':'Total','currency':'Unit','category':'Group'})
        state=self.approve(self.add(value));self.assertEqual(len(state['totals']),2)
        self.assertEqual({r['net_spending'] for r in state['totals']},{'1.10','2.20'})
        value.pop('mapping');self.assertTrue(spending.parse(value)['errors'])
    def test_review_conflicts_unknown_credits_and_sign_mismatch(self):
        state=self.add();before=self.ledger.path.read_bytes();row=state['rows'][0]
        for change in [dict(type='unknown',review='approved'),dict(type='refund',review='approved')]:
            with self.assertRaises(ValueError):self.ledger.action('update',{'expected_revision':state['revision'],'changes':[dict(id=row['id'],category='Test',**change)]})
            self.assertEqual(before,self.ledger.path.read_bytes())
        with self.assertRaisesRegex(ValueError,'another session'):self.ledger.action('delete',{'expected_revision':'stale','confirm':'delete-spending'})
        state=self.approve(state)
        with self.assertRaisesRegex(ValueError,'another session'):self.ledger.action('update',{'expected_revision':'empty','changes':[]})
    def test_csv_export_formula_injection_and_delete_independence(self):
        value=source();value.update(sign='positive',content='Date,Description,Amount,Category\n2026-10-01,=HYPERLINK("bad"),12.34,=BAD\n')
        # Use csv.writer for a valid quoted formula cell.
        out=io.StringIO();w=csv.writer(out);w.writerow(['Date','Description','Amount','Category']);w.writerow(['2026-10-01','=HYPERLINK("bad")','12.34','@BAD']);value['content']=out.getvalue()
        state=self.add(value);export=list(csv.DictReader(io.StringIO(self.ledger.export().decode('utf-8-sig'))))
        self.assertTrue(export[0]['description'].startswith("'="));self.assertTrue(export[0]['category'].startswith("'@"));self.assertEqual(export[0]['amount'],'12.34')
        if sys.platform!='win32':self.assertEqual(self.ledger.path.stat().st_mode&0o777,0o600)
        wallet=self.ledger.path.parent/'wallet.json';wallet.write_text('preserve')
        self.ledger.action('delete',{'expected_revision':state['revision'],'confirm':'delete-spending'})
        self.assertFalse(self.ledger.path.exists());self.assertEqual(wallet.read_text(),'preserve');self.assertEqual(self.ledger.snapshot()['rows'],[])
    def test_debit_credit_reject_ambiguous_signs_and_rounding(self):
        for amounts in ('-1,0','1,1','0,0.001'):
            value=source();value['content']='Date,Description,Debit,Credit\n2026-10-01,Shop,'+amounts
            self.assertTrue(spending.parse(value)['errors'])
    def test_pdf_extractor_does_not_overwrite(self):
        import importlib.util
        from unittest.mock import patch
        import subprocess
        script=Path(__file__).resolve().parents[1]/'plugins/walletfreak-spending/scripts/extract_pdf.py'
        spec=importlib.util.spec_from_file_location('extract_pdf',script);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        pdf=Path(self.temp.name)/'statement.pdf';pdf.write_bytes(b'fake')
        dest=Path(self.temp.name)/'statement.txt'
        with patch.object(sys,'argv',[str(script),str(pdf),str(dest)]),patch.object(module.shutil,'which',return_value='/test/pdftotext'),patch.object(module.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'private text',b'')):
            module.main();self.assertEqual(dest.read_bytes(),b'private text')
            with self.assertRaises(SystemExit):module.main()
            self.assertEqual(dest.read_bytes(),b'private text')

if __name__=='__main__':unittest.main()
