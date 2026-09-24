---
name: fe-requirement-format
description: When the user's request is vague or feature-sized, ask for requirements in the standard format; when they provide a requirement doc in that format, parse and implement fully without asking. Use the template in docs/getting-started/requirement-format.md and sample in docs/getting-started/requirements/sample-requirement.md.
---

# Requirement Format Skill

**For full intake (types, skills, rules), see docs/getting-started/requirement-intake.md.**

Use this skill when the user's request is **vague**, **feature-sized**, or **multi-part**, or when they explicitly want to use the **standard requirement format**. The format gives the AI everything needed to implement in one pass and gives the human a clear, repeatable way to get what they want.

## Triggers

- User says: "I have a requirement", "Here's my requirement", "Use the requirement format", "Fill in the requirement template"
- User's request is high-level or ambiguous: "We need notifications", "Add a billing section", "Build the settings flow"
- User pastes or attaches a document that has sections: **What**, **Where**, **Acceptance criteria** (and optionally Data/API, UI/Behavior, Constraints, Out of scope)

## Reference documents

- **Format spec + template:** `docs/getting-started/requirement-format.md` (in repo: `core-fe/docs/getting-started/requirement-format.md`)
- **Filled example:** `docs/getting-started/requirements/sample-requirement.md`

When asking the user for requirements, point them to `docs/getting-started/requirement-format.md` and `docs/getting-started/requirements/sample-requirement.md`.

---

## When the user has NOT provided a formatted requirement

If the request is vague or feature-sized and the user has **not** given a requirement doc in the standard format:

1. **Respond with the format** — do not guess and build the wrong thing.
2. **Say something like:**  
   "To implement this in one go and match what you want, please provide the details using our requirement format. You can copy the template from **docs/getting-started/requirement-format.md** or use this structure:"
3. **Paste the template** from `docs/getting-started/requirement-format.md` (What, Where, Acceptance criteria, Data/API, UI/Behavior, Constraints, Out of scope).
4. **Add:** "You can see a filled example in **docs/getting-started/requirements/sample-requirement.md**. Once you fill this in and paste it here, I'll implement it fully (including tests, route registration, and RBAC) without asking for confirmation."

Do **not** start implementing a large feature from a one-line vague request; ask for the formatted requirement first.

---

## When the user HAS provided a requirement in the format

When the user pastes or provides a document that clearly has the standard sections (What, Where, Acceptance criteria, and optionally Data/API, UI/Behavior, Constraints, Out of scope):

1. **Parse each section** and extract:
   - **What** → goal and scope
   - **Where** → layer and path (e.g. new page at `/notifications` → `src/pages/notifications/`)
   - **Acceptance criteria** → checklist to satisfy (list, buttons, empty state, loading, error, a11y)
   - **Data / API** → endpoints, response shape, permission names → `contracts.ts`, `api.ts`, `hooks/`, `core/rbac/policies.ts`
   - **UI / Behavior** → layout, forms, actions, validation/errors → page component, forms, data-testid
   - **Constraints** → apiClient, route.tsx, tests, a11y (already in project rules; apply them)
   - **Out of scope** → do not implement these

2. **Invoke the right skills** without asking:
   - **fe-code-structure** — placement, dependency rule, tests as part of implementation
   - **fe-page-scaffolding** — if it's a new page: route.tsx, Page, contracts, api, hooks, components/forms
   - **fe-test-generation** — colocated tests, vitest-axe, data-testid
   - **fe-agent-behavior** — no "Do you want tests?"; do route registration and RBAC as part of the work

3. **Implement completely:**
   - Create or update all files under the correct layer (pages, shared, core).
   - Register the route in `src/app/routes/routeTree.tsx` and add permissions in `src/core/rbac/policies.ts` if the requirement says the page/action is protected or lists permission names.
   - Add colocated tests and `data-testid` per fe-testing-requirements.
   - Ensure acceptance criteria are covered (list, buttons, empty state, loading, error, a11y as stated).

4. **Do not ask** for confirmation on tests, route registration, RBAC, or docs — do them. Only ask if a required piece of information is missing (e.g. permission name not stated and cannot be inferred from the page name).

---

## Checklist after parsing a requirement doc

- [ ] **Where** mapped to path: e.g. "New page at /notifications" → `src/pages/notifications/`
- [ ] **What** + **Acceptance criteria** → implemented in page + components + tests
- [ ] **Data / API** → `contracts.ts` (Zod), `api.ts` (apiClient), `hooks/use*.ts` (TanStack Query), RBAC in `policies.ts` if permissions given
- [ ] **UI / Behavior** → layout, forms, actions, errors reflected in components and data-testid
- [ ] **Constraints** → apiClient, route.tsx, a11y followed
- [ ] **Out of scope** → not implemented
- [ ] Route registered in `app/routes/routeTree.tsx`; permissions added if applicable
- [ ] Colocated tests added; no confirmation asked

---

## Related

- **fe-code-structure** — where to put files and that tests are mandatory
- **fe-page-scaffolding** — full page layout (route, page, contracts, api, hooks, tests)
- **fe-agent-behavior** — complete dependent tasks without asking
