import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "plugins/walletfreak/skills/trip-board"
spec = importlib.util.spec_from_file_location("render_board", SKILL / "scripts/render_board.py")
board = importlib.util.module_from_spec(spec)
spec.loader.exec_module(board)


class TripBoard(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((SKILL / "assets/example-trip.json").read_text())

    def test_example_preserves_quotes_failures_and_itinerary(self):
        html = board.render(self.data)
        self.assertEqual(html.count('<article class="option"'), 5)
        for option in self.data["options"]:
            self.assertIn(option["price"], html)
            self.assertIn(f'data-status="{option["status"]}"', html)
        self.assertIn("Illustrative example", html)
        self.assertIn("America/New_York", html)
        self.assertIn('href="#option-0"', html)
        self.assertIn("unknown", html)

    def test_escape_untrusted_text_and_remove_session_query(self):
        self.data["title"] = '</title><script>alert(1)</script>{{SCRIPT}}'
        self.data["options"][0]["title"] = '<img src=x onerror="alert(1)">'
        self.data["options"][0]["sources"][0]["url"] = 'https://example.com/search?session=SECRET#PRIVATE'
        html = board.render(self.data)
        self.assertNotIn('<script>alert(1)', html)
        self.assertNotIn('<img src=x', html)
        self.assertIn('&lt;img src=x', html)
        self.assertIn('{{SCRIPT}}', html)
        self.assertNotIn('SECRET', html)
        self.assertNotIn('PRIVATE', html)
        self.assertIn('href="https://example.com/search"', html)

    def test_reject_malformed_unsafe_and_private_inputs(self):
        for url in ('javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://user:secret@example.com', 'https://example.com\\@evil.test', 'https://example.com/\nsecret'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                board.source_url(url)
        changes = [
            lambda d: d.update(wallet={'points': 12345}),
            lambda d: d.update(options={}),
            lambda d: d.update(generated_at='2026-10-17T10:00:00'),
            lambda d: d['options'][0].update(status='guaranteed'),
            lambda d: d['options'][0].update(observed_at=None),
            lambda d: d['options'][0].update(sources=[]),
            lambda d: d['options'][0].update(price=0),
            lambda d: d['options'][0].update(balance=12345),
            lambda d: d['options'][1].update(id=d['options'][0]['id']),
            lambda d: d['itinerary'][0].update(option_id='missing'),
        ]
        for change in changes:
            data = copy.deepcopy(self.data)
            change(data)
            with self.subTest(data=data), self.assertRaises(ValueError):
                board.render(data)

    def test_missing_price_is_unknown_and_empty_board_works(self):
        self.data['options'][0].pop('price')
        self.assertIn('Price unknown', board.render(self.data))
        html = board.render({'title':'New trip','generated_at':'2026-10-17T10:00:00Z'})
        self.assertIn('No options researched yet.', html)
        self.assertIn('No itinerary drafted yet.', html)
        self.assertNotIn('Illustrative example', html)

    def test_dated_events_and_booking_labels_match_structured_fields(self):
        for change in (
            lambda d: d['itinerary'][0].pop('day'),
            lambda d: d['itinerary'][0].update(title='Booked departure', booking_status='proposed'),
            lambda d: d['itinerary'][1].update(stay={'check_in':'2027-04-14','check_out':'2027-04-16'}),
        ):
            data=copy.deepcopy(self.data)
            change(data)
            with self.assertRaises(ValueError):board.validate(data)

    def test_payment_cards_and_benefit_states_are_validated_and_escaped(self):
        option=self.data['options'][0]
        option['payment']={'card':'<script>private</script>','reason':'Existing card required', 'benefits':[
            {'name':'Credit','status':'planned','detail':'Proposed; not spent'},
            {'name':'Old credit','status':'used','detail':'User reports already used on an earlier purchase','recorded_at':'2026-10-18T12:00:00Z'},
            {'name':'Other credit','status':'not-used','detail':'Not applicable to this purchase'}]}
        html=board.render(self.data)
        self.assertIn('Pay with: &lt;script&gt;private&lt;/script&gt;',html)
        self.assertIn('Planned · not spent',html);self.assertIn('Already used',html);self.assertIn('Not used',html)
        self.assertNotIn('<script>private',html)
        option['payment']['benefits'][1].pop('recorded_at')
        with self.assertRaises(ValueError):board.validate(self.data)
        option['payment']['benefits'][1]['status']='guaranteed'
        with self.assertRaises(ValueError):board.validate(self.data)
        option['payment']['benefits'].pop(1)
        option['payment']['password']='secret'
        with self.assertRaises(ValueError):board.validate(self.data)

    def test_hotel_photos_are_safe_optional_and_exported(self):
        option = next(o for o in self.data['options'] if o['kind'] == 'hotel')
        option['image'] = {'url': 'https://images.example.com/pool.jpg?imwidth=800&impolicy=crop&session=SECRET#PRIVATE', 'alt': 'Pool <view>', 'source_url': 'https://example.com/hotel?session=SECRET'}
        html = board.render(self.data)
        self.assertIn('src="https://images.example.com/pool.jpg?imwidth=800&amp;impolicy=crop"', html)
        self.assertIn('alt="Pool &lt;view&gt;"', html)
        self.assertIn('loading="lazy" decoding="async" referrerpolicy="no-referrer"', html)
        self.assertIn('img-src https:', html)
        self.assertNotIn('SECRET', html)
        self.assertNotIn('PRIVATE', html)
        for url in ('http://example.com/p.jpg', 'data:image/png;base64,abc', 'javascript:alert(1)', 'https://user:secret@example.com/p.jpg', 'https://localhost/p.jpg', 'https://127.0.0.1/p.jpg', 'https://192.168.1.2/p.jpg', 'https://[::1]/p.jpg', 'https://hotel.local/p.jpg'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                board.photo_url(url)
        for change in (lambda i: i.update(alt=''), lambda i: i.update(cookie='secret'), lambda i: i.pop('source_url')):
            bad = copy.deepcopy(self.data)
            change(next(o for o in bad['options'] if o['kind'] == 'hotel')['image'])
            with self.assertRaises(ValueError):
                board.validate(bad)
        option['kind'] = 'flight'
        with self.assertRaises(ValueError):
            board.validate(self.data)

    def test_self_contained_copy_and_safe_replacement(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            isolated = root / 'walletfreak/skills/trip-board'
            shutil.copytree(SKILL.parents[1], root / 'walletfreak')
            original_assets = board.ASSETS
            try:
                board.ASSETS = isolated / 'assets'
                html = board.render(self.data)
            finally:
                board.ASSETS = original_assets
            output = root / 'site/index.html'
            board.write_board(output, html)
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError):
                board.write_board(output, 'replacement')
            self.assertEqual(output.read_text(), html)
            board.write_board(output, 'replacement', overwrite=True)
            self.assertEqual(output.read_text(), 'replacement')
            symlink = root / 'link.html'
            symlink.symlink_to(output)
            with self.assertRaises(ValueError):
                board.write_board(symlink, 'bad', overwrite=True)
            self.assertEqual(output.read_text(), 'replacement')


if __name__ == '__main__':
    unittest.main()
