#!/usr/bin/env python3
"""Render sanitized trip research as one portable, offline HTML document."""
import argparse
import base64
from datetime import datetime, date
import hashlib
import ipaddress
import math
from html import escape
import json
import os
from pathlib import Path
import tempfile
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ASSETS = Path(__file__).resolve().parents[1] / "assets"
KINDS = ("flight", "hotel", "lounge", "transport", "other")
STATUSES = ("available", "unavailable", "waitlisted", "blocked", "unverified")
DETAILS = ("search", "product", "terms", "benefits", "uncertainty", "reproduce")


def text(value, field, required=False):
    if not isinstance(value, str) or (required and not value.strip()):
        raise ValueError(f"{field} must be {'nonempty ' if required else ''}text")
    return value


def timestamp(value, field):
    text(value, field, True)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"{field} needs an ISO timestamp with a time zone") from None
    if parsed.utcoffset() is None:
        raise ValueError(f"{field} needs a time zone")


def source_url(value):
    text(value, "source URL", True)
    if any(c.isspace() or ord(c) < 32 for c in value) or "\\" in value:
        raise ValueError("Source URLs cannot contain whitespace or backslashes")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Source URLs must be HTTPS without credentials")
    # Entry points plus separate reproduction steps avoid exporting session queries.
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def photo_url(value):
    url = source_url(value)
    sizes = {'imwidth', 'width', 'height', 'w', 'h', 'q', 'quality', 'rw', 'rh', 'cw', 'ch', 'xposition', 'yposition', 'cx', 'cy'}
    crops = {'impolicy': {'crop'}, 'gravity': {'NorthWest', 'North', 'NorthEast', 'West', 'Center', 'East', 'SouthWest', 'South', 'SouthEast'}}
    query = urlencode([(key, val) for key, val in parse_qsl(urlsplit(value).query)
                       if (key in sizes and re.fullmatch(r'-?[0-9]{1,5}', val)) or val in crops.get(key, set())])
    if query:
        url += '?' + query
    host = urlsplit(url).hostname.lower()
    if '.' not in host or host.endswith(('.localhost', '.local', '.internal')):
        raise ValueError('Hotel photos need a public HTTPS host')
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return url
    if not address.is_global:
        raise ValueError('Hotel photos cannot use private network addresses')
    return url


def validate(data):
    if not isinstance(data, dict):
        raise ValueError("Board input must be an object")
    allowed = {"title", "summary", "generated_at", "illustrative", "options", "research", "itinerary", "gaps", "actions", "lodging_window"}
    if data.keys() - allowed:
        raise ValueError("Unknown board fields; do not include wallet balances or profiles")
    text(data.get("title"), "title", True)
    timestamp(data.get("generated_at"), "generated_at")
    text(data.get("summary", ""), "summary")
    if type(data.get("illustrative", False)) is not bool:
        raise ValueError("illustrative must be true or false")
    for name in ("options", "research", "itinerary", "gaps", "actions"):
        if not isinstance(data.get(name, []), list):
            raise ValueError(f"{name} must be a list")
    if len(data.get('actions', [])) > 100:
        raise ValueError('Use at most 100 user actions')
    action_ids = set()
    for action in data.get('actions', []):
        if not isinstance(action, dict) or set(action) - {'id', 'title', 'detail', 'kind', 'due_on'} or not {'id', 'title', 'kind'} <= set(action):
            raise ValueError('Invalid user action')
        identifier = text(action['id'], 'action id', True)
        if not re.fullmatch(r'[a-zA-Z0-9-]{1,64}', identifier) or identifier in action_ids:
            raise ValueError('Actions need unique stable IDs')
        action_ids.add(identifier)
        text(action['title'], 'action title', True)
        text(action.get('detail', ''), 'action detail')
        if action['kind'] not in ('sign-in', 'verify', 'other'):
            raise ValueError('Unknown user action kind')
        if 'due_on' in action:
            if not isinstance(action['due_on'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', action['due_on']):
                raise ValueError('Action due date needs YYYY-MM-DD')
            date.fromisoformat(action['due_on'])
    if 'lodging_window' in data:
        window = data['lodging_window']
        if not isinstance(window, dict) or set(window) != {'check_in', 'check_out'}:
            raise ValueError('Lodging window needs check_in and check_out dates')
        for value in window.values():
            if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError('Lodging dates need YYYY-MM-DD')
        if date.fromisoformat(window['check_out']) <= date.fromisoformat(window['check_in']):
            raise ValueError('Lodging check-out must follow check-in')
    ids = set()
    for option in data.get("options", []):
        if not isinstance(option, dict):
            raise ValueError("Each option must be an object")
        allowed_option = {"id", "kind", "status", "title", "provider", "program", "price", "observed_at", "sources", "cost", "choice_group", "payment", "image", *DETAILS}
        if option.keys() - allowed_option:
            raise ValueError("Unknown option fields")
        if 'image' in option:
            image = option['image']
            if option.get('kind') != 'hotel' or not isinstance(image, dict) or set(image) != {'url', 'alt', 'source_url'}:
                raise ValueError('Hotel image needs url, alt and source_url')
            photo_url(image['url'])
            text(image['alt'], 'hotel photo description', True)
            source_url(image['source_url'])
        identifier = text(option.get("id"), "option id", True)
        if identifier in ids:
            raise ValueError("Option IDs must be unique")
        ids.add(identifier)
        if 'choice_group' in option:
            text(option['choice_group'], 'choice group', True)
        if 'cost' in option:
            cost = option['cost']
            if not isinstance(cost, dict) or set(cost) - {'cash', 'currency', 'points', 'program', 'complete'} or not {'cash', 'currency', 'complete'} <= set(cost):
                raise ValueError('Cost needs cash, currency and completeness; optional points and program')
            if type(cost['complete']) is not bool or not isinstance(cost['currency'], str) or not re.fullmatch('[A-Z]{3}', cost['currency']):
                raise ValueError('Invalid cost currency or completeness')
            if not isinstance(cost['cash'], str) or not re.fullmatch(r'\d+(\.\d{1,4})?', cost['cash']) or len(cost['cash']) > 20:
                raise ValueError('Cash must be a nonnegative decimal string')
            if 'points' in cost and (type(cost['points']) is not int or not 0 <= cost['points'] <= 10**12):
                raise ValueError('Points must be a nonnegative integer')
            if cost.get('points'):
                text(cost.get('program'), 'points program', True)
            if not option.get('choice_group'):
                raise ValueError('Structured costs need an itinerary choice group')
        if 'payment' in option:
            payment = option['payment']
            if not isinstance(payment, dict) or payment.keys() - {'card','reason','benefits'}:
                raise ValueError('Invalid payment recommendation')
            text(payment.get('card'), 'payment card (or To confirm / Not required)', True)
            text(payment.get('reason'), 'payment reason', True)
            if not isinstance(payment.get('benefits',[]), list):
                raise ValueError('Payment benefits must be a list')
            for benefit in payment.get('benefits',[]):
                if not isinstance(benefit,dict) or benefit.keys() - {'name','status','detail','recorded_at'}:
                    raise ValueError('Invalid payment benefit')
                text(benefit.get('name'),'benefit name',True)
                text(benefit.get('detail'),'benefit detail',True)
                if benefit.get('status') not in ('planned','used','not-used','conditional','unavailable'):
                    raise ValueError('Invalid benefit usage status')
                if benefit['status']=='used' or 'recorded_at' in benefit:
                    timestamp(benefit.get('recorded_at'),'benefit recorded_at')
        text(option.get("title"), "option title", True)
        if option.get("kind") not in KINDS or option.get("status") not in STATUSES:
            raise ValueError("Unknown option kind or availability status")
        for name in ("provider", "program", "price", *DETAILS):
            if name in option:
                text(option[name], name)
        observed = option.get("observed_at")
        if observed is not None:
            timestamp(observed, "observed_at")
        sources = option.get("sources", [])
        if not isinstance(sources, list):
            raise ValueError("sources must be a list")
        for source in sources:
            if not isinstance(source, dict) or set(source) != {"label", "url"}:
                raise ValueError("Each source needs only label and url")
            text(source["label"], "source label", True)
            source_url(source["url"])
        if option["status"] == "available" and (observed is None or not sources):
            raise ValueError("Available options need an observation timestamp and a source")
    for item in data.get("research", []):
        if not isinstance(item, dict) or item.keys() - {"title", "detail", "observed_at", "url"}:
            raise ValueError("Invalid research entry")
        text(item.get("title"), "research title", True)
        text(item.get("detail"), "research detail", True)
        if item.get("observed_at") is not None:
            timestamp(item["observed_at"], "research observed_at")
        if item.get("url") is not None:
            source_url(item["url"])
    for item in data.get("itinerary", []):
        if not isinstance(item, dict) or item.keys() - {"when", "title", "detail", "option_id", "day", "place", "stay", "route", "booking_status", "price"}:
            raise ValueError("Invalid itinerary entry")
        for name in ("when", "title", "detail"):
            text(item.get(name), f"itinerary {name}", True)
        if 'day' in item:
            if not isinstance(item['day'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', item['day']):
                raise ValueError('Itinerary day needs YYYY-MM-DD')
            date.fromisoformat(item['day'])
        elif re.search(r'\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:[–-]\d{1,2})?,?\s+\d{4}\b', item['when'], re.I):
            raise ValueError('Add day for a dated itinerary entry')
        if 'price' in item and (not isinstance(item['price'],str) or len(item['price'])>80): raise ValueError('Invalid itinerary price')
        if 'booking_status' in item and item['booking_status'] not in ('proposed','booked','cancelled'):
            raise ValueError('Unknown booking status')
        if re.match(r'Booked\b', item['title'], re.I) and item.get('booking_status') != 'booked':
            raise ValueError('Booked titles require booked status')
        if 'place' in item:
            place = item['place']
            if not isinstance(place, dict) or set(place) != {'label','lat','lng','confidence','source_url'}:
                raise ValueError('Place needs label, coordinates, confidence and public source_url')
            text(place['label'], 'place label', True)
            for key, limit in [('lat',90), ('lng',180)]:
                if type(place[key]) not in (int,float) or not math.isfinite(place[key]) or abs(place[key]) > limit:
                    raise ValueError('Invalid map coordinates')
            if place['confidence'] not in ('verified','approximate'):
                raise ValueError('Unknown location confidence')
            source_url(place['source_url'])
        if 'stay' in item:
            stay = item['stay']
            if not isinstance(stay, dict) or set(stay) != {'check_in','check_out'}:
                raise ValueError('Stay needs check_in and check_out dates')
            for value in stay.values():
                if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                    raise ValueError('Stay dates need YYYY-MM-DD')
            if date.fromisoformat(stay['check_out']) <= date.fromisoformat(stay['check_in']):
                raise ValueError('Check-out must follow check-in')
            if item.get('day') and item['day'] != stay['check_in']:
                raise ValueError('Stay day must match check-in')
        if 'route' in item:
            route = item['route']
            if not isinstance(route, dict) or set(route) - {'mode','duration','source_url'} or 'mode' not in route:
                raise ValueError('Invalid route leg')
            if route['mode'] not in ('flight','train','drive','walk','transit','ferry','other'):
                raise ValueError('Unknown transport mode')
            if 'duration' in route: text(route['duration'], 'route duration', True)
            if 'duration' in route and not route.get('source_url'):
                raise ValueError('Route duration needs a source')
            if route.get('source_url'): source_url(route['source_url'])
        if "option_id" in item and item["option_id"] not in ids:
            raise ValueError("Itinerary references an unknown option")
    for gap in data.get("gaps", []):
        text(gap, "gap", True)


def link(label, url):
    return f'<a href="{escape(source_url(url), quote=True)}" target="_blank" rel="noopener noreferrer">{escape(label)} ↗</a>'


def photo_html(option):
    image = option.get('image') if option else None
    if not image:
        return ''
    return f'<figure class="hotel-photo"><img class="hotel-photo-image" src="{escape(photo_url(image["url"]), quote=True)}" alt="{escape(image["alt"], quote=True)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="800" height="450"><figcaption>{link("Hotel photo source", image["source_url"])}</figcaption></figure>'


def payment_html(option):
    payment = option.get('payment') if option else None
    if not payment:
        return '<div class="payment"><strong>Payment card: To confirm</strong><p>No benefit usage recorded.</p></div>'
    labels = {'planned':'Planned · not spent','used':'Already used','not-used':'Not used','conditional':'Conditional','unavailable':'Unavailable'}
    rows = ''.join(f'<li><span class="benefit-state {b["status"]}">{labels[b["status"]]}</span> <strong>{escape(b["name"])}</strong> — {escape(b["detail"])}' + (f' <small>Recorded {escape(b["recorded_at"])}</small>' if b.get('recorded_at') else '') + '</li>' for b in payment.get('benefits',[]))
    return f'<div class="payment"><strong>Pay with: {escape(payment["card"])}</strong><p>{escape(payment["reason"])}</p>' + (f'<ul>{rows}</ul>' if rows else '<p>No benefit usage recorded.</p>') + '</div>'


def render(data):
    validate(data)
    options = data.get("options", [])
    anchors = {option["id"]: f"option-{i}" for i, option in enumerate(options)}
    cards = []
    for option in options:
        anchor = anchors[option["id"]]
        detail = "".join(f'<dt>{name.title()}</dt><dd>{escape(option.get(name) or "Not recorded")}</dd>' for name in DETAILS)
        sources = " · ".join(link(source["label"], source["url"]) for source in option.get("sources", [])) or "No source recorded"
        cost = option.get('cost') or {}
        amount = cost.get('cash') if option['kind'] == 'flight' and option['status'] == 'available' and cost.get('complete') and not cost.get('points') else ''
        cards.append(f'''<article class="option" id="{anchor}" data-kind="{option['kind']}" data-status="{option['status']}" data-amount="{escape(amount)}" data-currency="{escape(cost.get('currency', ''))}" data-group="{escape(option.get('choice_group', ''), quote=True)}">
{photo_html(option)}
<div class="card-top"><div><small>{escape(option.get('provider') or 'Provider not recorded')}</small><h3>{escape(option['title'])}</h3></div><span class="status {option['status']}">{option['status'].title()} at observation</span></div>
<div class="quote"><div><small>{option['kind'].upper()} / {escape(option.get('program') or 'Program to confirm')}</small><p>{escape(option.get('product') or 'Product and schedule not recorded.')}</p></div><div><strong>{escape(option.get('price') or 'Price unknown')}</strong><small>{'WHOLE OPTION · RECHECK BEFORE BOOKING' if amount else 'TOTAL NOT VERIFIED'}</small></div></div>
<div class="card-actions"><span>Observed {escape(option.get('observed_at') or 'not recorded')}</span><label class="shortlist"><input type="checkbox" aria-label="Shortlist {escape(option['title'], quote=True)}"><span aria-hidden="true">☆</span></label><button type="button" class="compare-button" aria-pressed="false">+ Compare</button><button type="button" class="evidence-button">View evidence ›</button></div>
<p class="caution">{escape(option.get('uncertainty') or 'Review current terms before booking.')}</p>
<details><summary>View evidence</summary><dl>{detail}</dl>{payment_html(option)}<p>{sources}</p></details></article>''')
    research = []
    for item in data.get("research", []):
        source = link("Official source", item["url"]) if item.get("url") else "No source recorded"
        research.append(f'<article class="note"><h3>{escape(item["title"])}</h3><p>{escape(item["detail"])}</p><p class="observed">Observed: {escape(item.get("observed_at") or "Not recorded")} · {source}</p></article>')
    itinerary = []
    for item in data.get("itinerary", []):
        ref = f'<a href="#{anchors[item["option_id"]]}">View option</a>' if "option_id" in item else "Unpriced / separate item"
        option = next((o for o in options if o['id'] == item.get('option_id')), None)
        payment = payment_html(option) if option else ''
        itinerary.append(f'<li><p class="when">{escape(item["when"])}</p><h3>{escape(item["title"])}</h3>{photo_html(option)}<p>{escape(item["detail"])}</p>{payment}{ref}</li>')
    components = ASSETS.parents[2] / 'assets/components/v1'
    rows = [{**next((o for o in options if o['id'] == item.get('option_id')), {}), **item} for item in data.get('itinerary', [])]
    for row in rows:
        row.pop('image', None)
        if row.get('option_id') in anchors: row['option_anchor'] = '#' + anchors[row['option_id']]
        row['sources'] = [{**source, 'url':source_url(source['url'])} for source in row.get('sources', [])]
        for key in ('place','route'):
            if row.get(key, {}).get('source_url'): row[key] = {**row[key], 'source_url':source_url(row[key]['source_url'])}
    payload = json.dumps(rows).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    window_payload = json.dumps(data.get('lodging_window')).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    insights = []
    for kind in KINDS:
        same_kind = [o for o in options if o['kind'] == kind]
        if not same_kind:
            continue
        complete = [o for o in same_kind if kind == 'flight' and o['status'] == 'available' and o.get('cost', {}).get('complete') and not o['cost'].get('points') and o.get('choice_group')]
        group = next((o for o in complete if any(p is not o and p['choice_group'] == o['choice_group'] and p['cost']['currency'] == o['cost']['currency'] for p in complete)), None)
        peers = [o for o in complete if group and o['choice_group'] == group['choice_group'] and o['cost']['currency'] == group['cost']['currency']]
        quotes = ''.join(f'<div><span>{escape(o["title"])}</span><strong>{escape(o.get("price") or "Price unknown")}</strong></div>' for o in peers)
        checks = ''.join(f'<li>{escape(gap)}</li>' for gap in data.get('gaps', [])[:5]) or '<li>No open questions recorded. Recheck current terms.</li>'
        insights.append(f'<div data-insight-kind="{kind}"><section><small>QUOTE COMPARISON / 01</small><h3>{"What does the choice cost?" if peers else "One benchmark. More to verify."}</h3><p>{"Complete cash quotes in the same choice group and currency." if peers else "No directly comparable complete cash quotes in this category."}</p>{quotes}</section><section><small>BEFORE YOU BOOK / 02</small><h3>The missing pieces.</h3><ol>{checks}</ol><p>Points, conditional credits and unknown costs are not deducted from quotes.</p></section></div>')
    style = (ASSETS / "board.css").read_text() + '\n' + (components / 'components.css').read_text() + '\n.wf-load-map,.wf-route>.wf-map-note:last-of-type{display:none!important}'
    script = (ASSETS / "board.js").read_text()
    script += '\n' + (components / 'components.js').read_text() + '\nWalletFreakComponents.renderTrip(document.querySelector("#export-trip"),'+payload+','+window_payload+');'
    digest = lambda value: base64.b64encode(hashlib.sha256(value.encode()).digest()).decode()
    replacements = {
        "TITLE": escape(data["title"]), "SUMMARY": escape(data.get("summary", "")),
        "GENERATED": escape(data["generated_at"]), "COUNT": str(len(options)),
        "METRICS": ''.join(f'<div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>' for label,value,detail in (
            ('RESEARCHED OPTIONS',len(options),'All finding types'),
            ('AVAILABLE AT OBSERVATION',sum(o['status']=='available' for o in options),'Recheck before booking'),
            ('COMPLETE QUOTES',sum(o['status']=='available' and bool(o.get('cost',{}).get('complete')) for o in options),'Gross amounts only'),
            ('OPEN QUESTIONS',len(data.get('gaps',[])),'Review below'))),
        "INSIGHTS": ''.join(insights),
        "NOTICE": "Illustrative example · Fictional prices and availability, not live quotes." if data.get("illustrative") else "Research snapshot · Recheck prices, availability and terms before booking.",
        "OPTIONS": "".join(cards) or '<p class="empty">No options researched yet.</p>',
        "RESEARCH": "".join(research) or '<p class="empty">No additional research notes yet. Evidence for each option is under Research &amp; restrictions.</p>',
        "ITINERARY": "".join(itinerary) or '<li class="empty">No itinerary drafted yet.</li>',
        "GAPS": "".join(f'<li>{escape(gap)}</li>' for gap in data.get("gaps", [])) or '<li>No gaps recorded. Confirm completeness before treating any quoted amount as a trip total.</li>',
        "KINDS": "".join(f'<option value="{kind}">{kind.title()}</option>' for kind in KINDS),
        "STATUSES": "".join(f'<option value="{status}">{status.title()}</option>' for status in STATUSES),
        "STYLE": style, "SCRIPT": script, "STYLE_HASH": digest(style), "SCRIPT_HASH": digest(script),
    }
    # Replace once so input containing template tokens remains literal text.
    import re
    return re.sub(r"\{\{([A-Z_]+)\}\}", lambda match: replacements[match[1]], (ASSETS / "board.html").read_text())


def write_board(destination, html, overwrite=False):
    destination = Path(destination)
    if destination.is_symlink() or (destination.exists() and not overwrite):
        raise ValueError("Output exists or is a symlink; choose a new file or use --overwrite for an existing board")
    destination.parent.mkdir(parents=True, exist_ok=True)
    old = destination.read_bytes() if destination.exists() else None
    fd, temporary = tempfile.mkstemp(prefix=".trip-board-", dir=destination.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(html)
        if destination.is_symlink() or (destination.read_bytes() if destination.exists() else None) != old:
            raise ValueError("Output changed during rendering; original retained")
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Sanitized trip JSON (not a traveler profile)")
    parser.add_argument("output", type=Path, help="Destination HTML file")
    parser.add_argument("--overwrite", action="store_true", help="Replace a previously generated board")
    args = parser.parse_args()
    try:
        if args.input.resolve() == args.output.resolve():
            raise ValueError("Input and output must be different files")
        html = render(json.loads(args.input.read_text(encoding="utf-8")))
        write_board(args.output, html, args.overwrite)
    except (OSError, ValueError, TypeError) as error:
        parser.exit(1, f"Board not written: {error}\n")
    print(args.output.resolve())


if __name__ == "__main__":
    main()
