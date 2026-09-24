---
description: Backend-only — events/queues/workers chain (not applicable to core-fe)
argument-hint: (no arguments)
allowed-tools: Read
---

**Not applicable to core-fe.** This command exists in core-be for BullMQ workers,
event handlers, and queue processors (`workers-events` chain).

core-fe has no worker runtime. Async work belongs in **core-be**. If a feature
needs background processing, implement it in the backend and consume the result
via API + TanStack Query on the frontend.

For frontend feature delivery, use **`/fe-build-requirement`** or the
**fe-auto-implement** skill instead.
