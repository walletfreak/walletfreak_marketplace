import json
from pathlib import Path
import re
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'plugins/walletfreak-credit-cards'
CATALOG = json.loads((PACKAGE / 'cards.json').read_text())


class CardCatalog(unittest.TestCase):
    def test_unique_products_aliases_and_bundled_guides(self):
        ids, names, aliases, guides = set(), set(), {}, set()
        for card in CATALOG:
            self.assertEqual(set(card), {'id', 'name', 'family', 'market', 'variant', 'access', 'aliases', 'guide'})
            self.assertRegex(card['id'], r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
            self.assertNotIn(card['id'], ids)
            self.assertNotIn(card['name'], names)
            self.assertNotIn(card['guide'], guides)
            ids.add(card['id']); names.add(card['name']); guides.add(card['guide'])
            self.assertEqual(card['market'], 'US')
            self.assertIn(card['variant'], ('personal', 'business'))
            self.assertIn(card['access'], ('standard', 'existing-or-limited'))
            for alias in [card['name'], *card['aliases']]:
                key = re.sub(r'[^a-z0-9]', '', alias.lower())
                self.assertTrue(key)
                self.assertIn(aliases.get(key, card['id']), (card['id'],), (alias, aliases.get(key)))
                aliases[key] = card['id']
            guide = (PACKAGE / card['guide']).resolve()
            self.assertTrue(guide.is_relative_to(PACKAGE.resolve()))
            self.assertTrue(guide.is_file())
            content = guide.read_text()
            self.assertEqual(content.splitlines()[0], '# ' + card['name'])
            sources = re.findall(r'\]\((https://[^)]+)\)', content)
            self.assertTrue(sources, card['id'])
            for source in sources:
                parsed = urlsplit(source)
                self.assertTrue(parsed.hostname)
                self.assertFalse(parsed.username or parsed.password or parsed.fragment)
        files = PACKAGE / 'skills/card-travel-benefits/references/cards'
        self.assertEqual({str(p.relative_to(PACKAGE)) for p in files.glob('*.md')}, guides)

    def test_family_scenarios_resolve_exact_products(self):
        scenarios = json.loads((ROOT / 'tests/card-product-scenarios.json').read_text())
        by_id = {card['id']: card for card in CATALOG}
        self.assertEqual({case['family'] for case in scenarios}, {card['family'] for card in CATALOG})
        self.assertEqual(len({case['id'] for case in scenarios}), len(scenarios))
        for case in scenarios:
            self.assertTrue(case['prompt'] and case['expected'])
            for card_id in case['expected_products']:
                self.assertIn(card_id, by_id)
                self.assertEqual(by_id[card_id]['family'], case['family'])


if __name__ == '__main__':
    unittest.main()
