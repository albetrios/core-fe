---
description: Backend-only — events/queues/workers chain (not applicable to core-fe)
argument-hint: (no arguments)
allowed-tools: Read
---

**Not applicable to core-fe.** core-be's **`/be-worker-complete`** covers BullMQ workers,
event handlers, and queue processors (its `worker-change` chain).

core-fe has no worker runtime. Async work belongs in **core-be**. If a feature
needs background processing, implement it in the backend and consume the result
via API + TanStack Query on the frontend.

For frontend feature delivery, use **`/fe-build-requirement`** or the
**fe-auto-implement** skill instead.
