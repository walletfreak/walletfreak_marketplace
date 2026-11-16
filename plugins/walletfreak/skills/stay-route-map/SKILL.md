---
name: stay-route-map
description: "Lay out hotel stays and travel legs with sourced locations, route order, local dates and overnight coverage gaps."
---

# Stays and route

Reuse the supplied itinerary and preserve stop order, local dates and named time zones, including overnight flights and date-line changes. Research public hotel addresses, airports and stations only as needed. Verify coordinates against public evidence if requested; omit unresolved coordinates and label approximations. Do not geocode private addresses implicitly.

Return a route/itinerary table in conversation: stop, arrival/departure, stay check-in/out, travel from the previous stop, sourced duration, booking status, evidence and gaps. A checkout day is not another occupied hotel night. Check every night between destination arrival and departure for gaps/overlaps; flag missing airport/station transfers and uncertain timing. Never derive journey duration from straight-line distance or infer a booking from a quote.

Provide public map/location links when useful. Export only if requested; no interactive map service or dashboard is required. Keep evidence links free of account identifiers and session tokens. If live research needs login, follow travel-plan's shared manual Chrome login guidance. Bookings and account changes remain user-operated.
