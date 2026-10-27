# Dashboard findings contract

Use the existing example fields: title, summary, generated_at (ISO with zone), optional illustrative boolean, options, research, itinerary, gaps and actions. Keep failed searches. Every available option needs an observation timestamp and a public HTTPS source.

Options have unique stable id, title, kind (flight/hotel/lounge/transport/other), status (available/unavailable/waitlisted/blocked/unverified), provider, program, quoted price text, observed_at, sources and optional search/product/terms/benefits/uncertainty/reproduce text. Do not reuse an ID for a different product.

For selected itinerary subtotals, add choice_group (e.g. outbound-flight, return-flight, tokyo-hotel) to mutually exclusive alternatives, and optional cost: {"cash":"500.00","currency":"USD","points":100000,"program":"ANA Mileage Club","complete":true}. Cash is a nonnegative decimal string covering the whole party/stay, including mandatory award charges. Points are nonnegative integers with their own program. Never parse price text to invent these fields. Unknown fees require complete:false. Conditional statement credits do not reduce cash due. One option per choice_group can be selected. Only available, complete costs enter subtotals, separated by currency and program; other selected items stay explicitly unpriced.

Research entries contain title, detail, optional observed_at and url. Itinerary entries contain when (local time with named zone), title, detail and optional option_id. Gaps are unresolved checks and unpriced components. Dates remain in the user's supplied order; don't infer local time zones from UTC alone.

`actions` are concrete steps for the traveler, distinct from research gaps. Each has a stable unique `id` (letters, digits and hyphens, up to 64 characters), `title`, `kind` (`sign-in`, `verify`, or `other`), and optional `detail` and `due_on` (YYYY-MM-DD). Publish a sign-in step when a portal requires the user; publish a verification step when the user must decide or check a specific term. Missing prices, credit balances, expiry dates and blocked research are gaps or uncertainty, not review actions. Do not put passwords, account numbers or private links in actions. The traveler can mark these steps addressed, and their status is retained across a refresh when the ID remains. Available flight and stay proposals with complete costs create booking actions automatically; those clear when reviewed itinerary data records the booking. Empty hotel nights stay in the calendar without a review action.

Publish a new result with `local.py publish --input -` and {"findings":{...}}. Update with {"id":"<result-id>","expected_revision":<current revision>,"findings":{...}}. Read current revisions with `local.py status`. A deleted result rejects updates; do not recreate it without a new user request.

The viewer renders itinerary entries immediately, using the linked option kind/provider for flight, stay, transport and lounge components. It preserves the research itinerary independently of local comparison selections. Include schedule/time-zone text and known restrictions; leave unknown timing explicit. Personal wallet data is never part of this display contract.

## Card and benefit plan per purchase

Each newly generated purchase option should include `payment`: `{"card":"Exact existing card product, To confirm, or Not required","reason":"Why this card/channel applies","benefits":[{"name":"Benefit name","status":"planned","detail":"Amount or count allocated, eligibility, shared allowance and conditions"}]}`. The viewer and standalone export show it on the option and linked itinerary entry, plus the comparison table in the viewer.

Statuses: `planned` (proposed, not spent), `used` (already consumed, with evidence described in detail and required `recorded_at` ISO timestamp with zone), `not-used` (not allocated to this purchase), `conditional` (depends on unconfirmed eligibility/availability), `unavailable` (expired, exhausted or ineligible). Never mark a planned benefit used because a user shortlisted or selected an option. No saved-wallet deduction occurs. Unknown card/benefit information stays explicit; an absent payment object in an older result displays To confirm.

Use exact existing card products without account numbers or private owner identifiers. Different cards can fund the points and pay the remaining cash. Check payment/portal requirements and allocate shared credits once across the trip. The benefit detail states whether a credit is a future reimbursement; it does not change gross cost fields. An empty benefits list means no usage documented, not proof that no benefits exist.

## Hotel photos

Hotel options may include one `image`: `{"url":"https://hotel.example.com/photos/pool.jpg","alt":"Rooftop pool at Example Hotel","source_url":"https://hotel.example.com/gallery/"}`. Use a direct public HTTPS image URL observed on the official hotel's site or its image CDN, plus the public page it came from. Prefer a modest-sized exterior, lobby or shared amenity photo; describe what it shows and avoid implying a pictured suite is the quoted room. No invented URLs, stock substitutes, base64, private/account URLs, signed links or downloaded image bundles. Only numeric image-sizing and supported crop parameters are retained; session queries and fragments are stripped. Verify the resulting URL still loads. If no reliable image is available, omit `image` and keep the listing.

The viewer and HTML export load remote photos lazily with no referrer and link back to the source. Images need internet access and may disappear if the host blocks embedding or removes them; the rest of the exported trip remains usable offline. Do not change quote evidence or availability when adding photos.


## Stays and route (optional, backwards compatible)

To show hotel nights still to book, add `lodging_window: {"check_in":"2026-11-01","check_out":"2026-11-08"}` to the findings. These are local destination dates: arrival night through departure morning. Check-out must follow check-in. The timeline calculates empty hotel slots after subtracting only `booking_status: "booked"` stays, including nights before the first stay and after the last. Proposed hotels do not cover nights. Do not infer the window from a flight departure date alone; review arrival dates and time zones. For multi-city or multiple traveler groups, describe uncertain locations or coverage in `gaps`.

An itinerary entry may add `day` (YYYY-MM-DD local date), `booking_status` (proposed, booked, cancelled; defaults to proposed), `stay: {"check_in":"2026-11-01","check_out":"2026-11-04"}`, and `place: {"label":"Public hotel or station name","lat":35.68,"lng":139.76,"confidence":"approximate","source_url":"https://example.com/location"}`. Coordinates must be finite and in range. Confidence is verified or approximate; omit unresolved coordinates. Check-out must follow check-in.

`route: {"mode":"train","duration":"About 45 minutes","source_url":"https://example.com/timetable"}` describes the leg from the previous entry. Modes: flight, train, drive, walk, transit, ferry, other. Duration is optional and requires a source; do not invent it. All lines are schematic. The viewer flags adjacent stay overlaps/gaps and missing connections, but the agent must check the whole trip, including first/last nights and time zones. Different travelers' simultaneous stays should be explained in gaps.

Timeline details and payment reasoning are collapsed by default. Hotel photo previews remain in Compare options. Standalone downloads retain the compact timeline and offline stop list.
