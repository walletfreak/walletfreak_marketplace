---
name: confirmation-import
description: "Turn pasted flight or hotel confirmation text into a reviewed local itinerary, preserving booking status, dates and reported costs. Use when a traveler has booked travel and wants it added to WalletFreak."
---

# Import confirmations

When a traveler supplies confirmation text in the agent conversation, extract structured flight or hotel fields, confirm uncertain dates, time zones, check-in/out, price currency and booking status, then publish via trip-board. The dashboard no longer has an email paste or layout picker. Keep original email text and confirmation codes out of saved findings. If the user requests a local import of a file, use the existing local confirmation parser and review its structured output before publishing. Missing dates stay unresolved and should not become booked itinerary items. Add a lodging window only when arrival and departure dates are known; this exposes empty hotel nights in Travel.

A saved import is a local trip with a visual timeline and potential costs. It can be enriched afterward with travel-plan, stay-route-map, card-travel-benefits and wallet-optimizer. The parser does not prove a reservation is active, extract every vendor format, or log in to check status. Never add raw confirmation codes, full ticket numbers, passwords or email bodies to public research, site templates, source links or exported trip details. If the traveler instead pastes text in the agent conversation, extract structured fields from that user-provided text, confirm uncertain facts, and publish through trip-board. Follow the host's model data handling for conversation content.
