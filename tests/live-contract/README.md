# Live third-party contract tier

Tests that talk to **real** third-party services, so a vendor change is caught here rather than in
production. Mirrors the model in core-be's `src/tests/contract/live/`.

Every other test in this repo mocks these vendors. That proves our wiring, but nothing fails when a
CDN URL is retired, a global is renamed, or a widget stops issuing tokens — the app quietly loses
captcha or payments while the suite stays green.

## Safety model

- **Opt-in per provider.** Nothing runs unless `CONTRACT_LIVE_PROVIDERS` names it
  (`turnstile`, `stripe`, or `all`). The default `pnpm test` and `pnpm test:e2e` make zero
  third-party calls, and this tier can never turn a normal run red because someone else's service
  is down.
- **No account needed.** The Turnstile site keys are Cloudflare's published testing values, and
  they pair with the secret keys core-be's live Turnstile contract verifies against.
- **Never a live Stripe key.** `stripePublishableKeyForLiveTests()` accepts only `pk_test_`,
  falling back to Stripe's own documented sample key.
- **Excluded from the normal configs.** `vitest.config.ts` projects and `playwright.config.ts`
  (`testDir: './tests/e2e'`) do not reach this directory; each half has its own config.

## The two halves

| Half        | File                          | Needs                         | Run with                             |
| ----------- | ----------------------------- | ----------------------------- | ------------------------------------ |
| **Node**    | `vendor-scripts.live.test.ts` | outbound HTTPS only           | `vitest.live-contract.config.ts`     |
| **Browser** | `*.live.e2e.test.ts`          | a browser with outbound HTTPS | `playwright.live-contract.config.ts` |

The split is deliberate. Fetching a vendor script and checking it is still served, still on the
right origin, and still exposing the global we reach for needs no browser. Rendering a Turnstile
widget or mounting a Stripe Payment Element does.

### Node half — runs anywhere

```sh
CONTRACT_LIVE_PROVIDERS=turnstile,stripe npx vitest run --config vitest.live-contract.config.ts
```

Covers: the exact CDN URLs the source hardcodes are live and serving JavaScript; the response stays
on the vendor's own origin through redirects (loading executable code from elsewhere would be a
supply-chain problem); the served bundles still contain the globals `InvisibleTurnstile` and
`loadStripe` depend on; and Cloudflare's `siteverify` endpoint — the one core-be redeems tokens
against — still answers in the documented envelope.

### Browser half — needs browser egress

```sh
CONTRACT_LIVE_PROVIDERS=turnstile,stripe \
  npx playwright test --config playwright.live-contract.config.ts
```

Covers: the real Turnstile script installing a working global, the always-passes keys minting a
token through `callback`, the always-blocks key driving `error-callback` instead, a malformed site
key issuing nothing, and repeat loads not clobbering the global. For Stripe: the constructor and
the methods `StripePaymentForm` calls, `elements()` accepting the setup-mode options the app
passes, a Payment Element mounting far enough to render Stripe's iframe, and an invalid key
throwing rather than being silently accepted.

#### Known environment limitation

**The browser half does not run inside the Claude Code web container.** Its Chromium cannot reach
external HTTPS: the session's egress proxy re-terminates TLS, and while the system trust store is
configured, Playwright's bundled Chromium launches with its own NSS profile that does not inherit
it. Every external host fails with `ERR_CONNECTION_RESET` (or `ERR_TUNNEL_CONNECTION_FAILED` for
hosts outside the egress allowlist), while Node and curl reach the same URLs. The proxy's own log
confirms it never rejected `challenges.cloudflare.com` or `js.stripe.com` — the failure is on the
browser's side of the tunnel.

This is why the Node half exists as a separate tier rather than a convenience: it keeps real
vendor-contract coverage available in environments where a browser cannot egress. Run the browser
half locally or in CI, where Chromium has direct network access.

Two flags help where a browser is available but the environment is unusual:

- `PLAYWRIGHT_CHROMIUM_PATH` — point at a provisioned Chromium when the pinned Playwright's own
  download is unavailable.
- `HTTPS_PROXY` — picked up automatically and handed to Chromium with loopback bypassed, so the
  dev server is still reached directly.

## Adding a provider

1. Add it to the `LiveProvider` union in `live-providers.ts`.
2. Prefer the Node half. Only reach for the browser half when the behaviour genuinely needs a DOM.
3. Gate the suite with `describe.skipIf(!isLiveProviderEnabled('<name>'))` (Vitest) or
   `test.skip(!isLiveProviderEnabled('<name>'), …)` (Playwright).
4. Never use a production credential, and never let a test's expectation depend on a branch over
   the result — derive it, so removing the behaviour fails the test.
