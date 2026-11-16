# Shared research and finding contract

Return one record per product/source. Include failed searches and keep quoted evidence distinct from assumptions.

| Field | Required detail |
| --- | --- |
| Search | Dates/flexibility, airports/destination, travelers/ages as needed, rooms, cabin/room filters, country of sale |
| Provider / program / source | Provider, loyalty program, marketing/operating airline or property, official booking source |
| Product | Full itinerary, cabin per segment, local dates/time zones and connections; or room, bed, occupancy, nights and payment timing; or rental branches, local pickup/return times, duration and vehicle class |
| Price | Total cash or points plus all mandatory cash charges; currency for every amount; party/stay totals, per-unit basis, unknown fees |
| Availability / observed at | Available, unavailable, waitlisted, blocked or unverified; number of seats/rooms if shown; ISO observation timestamp with time zone |
| Terms | Fare/room restrictions, cancellation deadline/time zone, penalties, refund/redeposit/change rules, baggage or mandatory property fees |
| Benefits / evidence | Discounts, credits, benefits, dates and eligible card/status; observed vs user-reported evidence; remaining allowance if relevant |
| Sources / uncertainty | Official result and terms links, session/login limitations, unavailable facts, currency conversion source/time/rate, transfer assumptions |
| Reproduce / book | Official entry point, search parameters and filters, then steps for the user to recheck and book |

## Flights

Match airports, dates, traveler count, cabin on every segment, fare flexibility, seats and baggage. Disclose mixed cabins, airport changes, overnight connections, separate tickets and self-transfer risks. An award must have enough confirmed seats for the party. Availability in one loyalty program does not establish availability in another. Do not enter passenger details or hold a fare to see a total; report the missing information instead.

## Hotels

Match dates, nights, number of rooms, exact room/bed/occupancy, meals, payment timing and cancellation deadline. Include taxes, resort/destination/service fees and mandatory pay-at-property amounts in the same total or flag them unknown. A headline nightly rate is not a stay total. Verify each award night and certificate eligibility. Do not assume direct-booking elite benefits or earnings apply to portal rates.

## Rental cars

Match pickup/return branches, exact local dates/times, billed duration, driver age, vehicle class, mileage/fuel rules and cancellation/payment terms. Include mandatory rental taxes and surcharges; optional extras and refundable deposits stay separate. Points plus cash must be an actual eligible redemption quote, not an award-chart estimate. If the reward selector requires checkout or a hold, leave the value unverified or use clearly labeled redacted user-supplied evidence. Use Hertz's dedicated skill for the search workflow.

## Card travel benefits

Use `walletfreak-credit-cards`’s `card-travel-benefits` skill through host discovery when cards could change flight/hotel/portal choices. If missing, run setup diagnostics in `travel-plan` and leave card savings unverified. Attach its per-card benefit ledger to the shared findings: eligibility evidence, exact period and remaining allowance, booking/payment constraints, quote/charge allocation and unresolved checks. Keep gross price, checkout amount, expected statement credits and noncash perks distinct. Allocate shared allowances once across the chosen itinerary. For a card-adjusted redemption scenario, adjust the cash comparator and award charges consistently; retain the gross comparison and mark uncertain credits conditional.

## Lounge tracker

Use the host-discovered `lounge-access` skill in `walletfreak` for airport/terminal eligibility, hours, traveler/guest costs and visit/pass ledgers. Include proposed versus user-reported used visits, period/expiry and evidence gaps. Eligibility is separate from capacity and actual admission. Keep lounge perks separate from cash avoided and cents per point. Missing instructions or terms mean unverified access.

## Portals, points and offers

Match the exact product with a direct alternative. Distinguish cash, portal point redemption and transfer-to-program awards. Do not apply an issuer-wide fixed redemption value; use the quote for the selected card and itinerary. Verify offer windows, enrollment, eligible payment method, minimum stay/spend and remaining credits. Expired offers are excluded. Conditional credit scenarios stay separate from gross payable cost; a property credit is not cash back. Avoid double-counting credits against both cash and award alternatives.

If available and comparable, value = (equivalent cash avoided − award cash charges) / points spent. Multiply by 100 for cents per point; specify which currency’s cents. Example: USD 900 cash versus 50,000 points + USD 100 gives USD 0.016 per point, or 1.6 US cents per point. If fees are unknown, currencies differ without conversion, points are zero or the award is unavailable, no definitive value. A negative value is valid and signals that the award cash cost exceeds the cash alternative.

## Final presentation

Use a compact comparison table followed by assumptions, verification gaps, sources and a user booking checklist. Show separate currency totals unless a conversion was disclosed. Recommendations must reflect preferences, feasible connections, cancellation exposure and evidence quality as well as price. Label illustrative examples and never mix them with observed quotes.
