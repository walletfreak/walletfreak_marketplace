---
name: stay-route-map
description: Map hotel stays and travel legs in an existing or proposed WalletFreak itinerary, including stay dates, route order and missing connections. Use for hotel maps, multi-stop routes and checking overnight coverage.
---

# Stays and route

Use the existing WalletFreak plugin and local trip viewer. Read [the trip data contract](../trip-board/references/data.md) for the optional `place`, `stay`, `route`, `day` and `booking_status` fields before publishing. Reuse existing result IDs and revisions through [trip-board](../trip-board/SKILL.md); preserve research, shortlist selections and unrelated entries.

Research public hotel addresses, airports and stations; verify coordinates against a public source. Never invent coordinates or geocode a private home address implicitly. Mark approximate locations explicitly; omit `place` when unresolved. Keep location and route evidence links public, without account identifiers or session URLs.

Each itinerary entry represents a stop. Its `route` describes travel from the previous stop, with a transport mode and optional sourced duration. Connections are schematic, not road geometry or navigation instructions. Never derive journey duration from straight-line distance. Preserve the traveler's supplied order, local dates and named time zones; account for overnight flights and date-line changes. The `day` field is the local calendar date, not a UTC conversion.

For hotels, supply structured `stay` check-in and check-out dates, with `day` set to check-in, even when the time is unknown. When destination arrival and departure dates are known, add the reviewed `lodging_window` so the timeline shows uncovered hotel nights as slots. Flag overlaps, missing airport/station transfers and uncertain timings in `gaps`. Only mark a booking booked from a user report or booking evidence; never infer it from available inventory or a shortlist. Keep payment card and benefit status on each purchase; proposed credits never become used automatically.

Publish and start the local viewer, returning its fresh private link. Trips offers a compact timeline, route list and optional street map. Clicking Load street map contacts OpenStreetMap for tiles; opening the dashboard alone does not. The standalone trip file includes the offline route list, not downloadable street tiles. Public-site templates must use fictional examples only.
