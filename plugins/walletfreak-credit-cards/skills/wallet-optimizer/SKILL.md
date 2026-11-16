---
name: wallet-optimizer
description: "Choose which card in the user's existing wallet to pay with, or which points/miles to redeem, using current quotes, redemption opportunities, earning rates, transfer offers and usable benefits. Use for best-card, cash-versus-points and best-value wallet comparisons."
---

# Choose from the user's wallet

Recommend a payment card and, when relevant, a redemption route for the actual purchase or trip. Compare the user's existing cards and currencies; acquiring a new card is a separate request. “Best value” means the best feasible choice for their needs, not the largest advertised multiplier or cents-per-point figure.

## Establish the decision

Reuse the conversation and [traveler-profile](../traveler-profile/SKILL.md). Include recorded gift cards, airline credits, TravelBank/stored funds, certificates, companion/upgrade awards and lounge entitlements. Verify each asset’s ownership, expiry, eligible purchase and stacking rules; do not equate stored cash with miles or call an unspecified travel credit TravelBank. Do not repeat intake on handoffs. Accept approximate self-reports, preserve ownership and reporting dates, and honor currencies the user wants to keep. A missing balance is unknown, not zero. Accept a short list in chat; saving a profile is optional.

Ask only for missing facts that could change the choice: purchase amount/currency, merchant and booking channel or exact itinerary, eligible card products/countries, accessible points, remaining benefits and their priorities. If no preference is stated, compare total economic cost with explicit assumptions, and separately identify lowest cash outlay and points-preserving alternatives. Do not assume the user will pay interest; if they report carrying debt, do not let speculative rewards outweigh known financing costs.

## Verify today's feasible options

For travel, use `provider-research` for current comparable quotes and [card-travel-benefits](../card-travel-benefits/SKILL.md) for payment requirements, credits, certificates, award discounts and protections. Reuse completed research and ledgers instead of restarting them. For other purchases, check current official issuer earning/redemption terms and relevant merchant offers.

Resolve each held card through the bundled [individual card catalog](../../cards.json) and load only its product guide plus card-travel-benefits' shared checks, including for nontravel earning comparisons. Keep personal/business, premium/basic and legacy/special variants distinct. Clarify ambiguous names; do not borrow benefits or transfer permissions from a related card.

- Record observation time and official source links. Check exact card variant, country, category/channel, caps, activation/enrollment, exclusions, offer targeting and dates. An old guide, search snippet, historical promotion or a generic blog valuation cannot establish current value. Do not assume a merchant's rewards category from its name.
- Get the actual cash and points totals for the same acceptable product, dates, travelers, baggage/room, cancellation rights and all mandatory fees. Check direct, eligible portal and partner routes when relevant. Expensive products the user would never buy are not a meaningful cash baseline.
- Check award availability before suggesting a transfer. Verify transfer partners, ratios, source-point increments/minimums, bonuses, eligibility/registration, expiry and expected timing. Account-specific offers are conditional until the user confirms them. Available seats are not guaranteed during a transfer, and transfers can be irreversible.
- Keep household owners, program currencies, existing destination balances and transferable bank points distinct. Only assume pooling or transferability when current rules and ownership permit it. Don't count one balance in multiple routes or an additional card as another shared credit allowance.
- Use final discounted award prices once; never apply a cardmember discount twice. Unknown award fees, unavailable inventory or unverified eligibility prevent an unconditional winner. If live access is blocked, offer a provisional comparison using dated or user-supplied evidence, identify the missing check, and leave sign-in/MFA to the user.

## Compare payment and redemption choices

Evaluate two related decisions: **how to fund the purchase** (cash, points, certificate, or a combination) and **which card pays any remaining cash**. The card paying award taxes may differ from the card/program supplying points; protections may require more than paying taxes. Enforce verified booking/payment conditions before ranking either decision.

Use the existing redemption calculator in `travel-plan` for known, same-currency amounts:

`(equivalent cash price − mandatory award cash charges) / points spent`

Show the currency per point, and cents per point where appropriate. This is realized value for that specific redemption, not a permanent value of the currency. Preserve unknown fees rather than calculating with zero. Present gross redemption value first; show separately how verified incremental cash-only versus award-only benefits or foregone rewards change the comparison. Future statement credits do not reduce cash due today.

For an economic-cost scenario, show the assumptions explicitly:

`cash due + opportunity cost of points/certificates used − incremental usable credits − value of rewards earned`

- Value rewards earned using an achievable redemption the user actually wants, a verified cash redemption floor, or a clearly labeled user-supplied valuation. Earning rates alone cannot rank different currencies. Do not value new points at an award that consumes those same unearned points, or at an inaccessible aspirational redemption. Separate earned quantities from estimated future value.
- There is no universal winner across currencies without an opportunity-cost assumption. Show a break-even valuation or a small range if it could change the winner. For the same product, a high cents-per-point result may still use more cash, scarce transferable points or restrictive terms. State those tradeoffs rather than treating the ratio alone as the objective.
- For transfer routes, calculate the actual source points required for the shortfall after usable destination points, rounded up to the permitted source increment. Show resulting destination points and any surplus. Charge the source points' opportunity cost once, plus existing destination points actually consumed; don't also charge the generated destination points. Do not report a mixed-currency redemption as one homogeneous points total.
- Cap credits at the usable charge and self-reported remaining allowance; allocate shared benefits once. Only verified stacking supports a combined scenario. Show targeted offers, uncertain credits and category coding as conditional. Keep noncash perks/protections and certificate expiry or alternative uses visible without assigning invented dollar values.
- Keep FX and foreign-transaction fees explicit. Convert cash currencies only with a dated source and stated rate. Exclude sunk annual fees and unearned welcome bonuses from a one-purchase ranking. A necessary incremental fee belongs in the comparison.

## Recommend and display

Lead with the best supported choice: **redeem from this program / pay cash, then use this existing card for the charge**, with the reason, cash due, points/certificates spent, expected rewards and any conditional credit. Show the runner-up and the assumption or price threshold that would reverse the choice. Do not force a definitive winner when essential facts remain unknown.

Return a compact comparison in conversation with gross cash due, points by program, payment-card requirements, conditional benefits, sources, observation times and assumptions. Export a sanitized file only when requested. Exclude private owner identities and balances from shared research exports; keep planned benefit allocations distinct from actual use.

Recommendations never spend points, change saved balances, activate offers, enroll benefits, apply for cards, transfer, reserve or buy. The user performs those actions. Do not store passwords, card/account numbers or verification codes.
