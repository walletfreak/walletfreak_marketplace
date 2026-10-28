---
name: dashboard-builder
description: "Maintain WalletFreak's bundled dashboard components and Concierge Travel template. Use when a user asks to change the dashboard design or component composition."
---

# Dashboard builder

The personal Travel page uses the bundled `concierge-travel` template from [catalog.json](../../assets/components/v1/catalog.json). Build dashboards from this installed catalog, [layout schema](../../assets/components/v1/layout.schema.json), and renderer; the public components.html page is a visual gallery, not an agent input. It does not expose a layout picker. Home lists saved trips; Travel shows the selected trip's route, calendar, explicit follow-ups and research files; Wallet contains cards, rewards and connected accounts. Requests and research remain in the agent conversation.

For a design change, inspect the [layout schema](../../assets/components/v1/layout.schema.json), bundled catalog, renderer and local dashboard CSS. Edit the smallest matching component or template and update the public example only when the request includes the site. Preserve existing result and wallet data. Do not place credentials, private values, scripts or external URLs in layout JSON. For Wallet components, read the bundled [program catalog](../../assets/wallet-programs.json) and [card catalog](../../assets/cards.json) for earning relationships and known tiers. Never infer a live balance or active membership tier from card ownership. Use `travel.*` sources for the Travel template; wallet and spending data live in their own views.

If the user asks to generate trip results, use [travel-plan](../travel-plan/SKILL.md) and [trip-board](../trip-board/SKILL.md). A template does not create findings, prices or booked status. Verify a rendered trip at desktop and narrow widths, including route fallback when locations are unknown. The local `layout` command remains for older saved data, but changing it does not change the fixed personal Travel page.
