module.exports = {
  ci: {
    collect: {
      // Every route a signed-OUT visitor can reach. They need no backend, which
      // is what lets them be audited here at all — the Playwright E2E suite is
      // local-only because it needs core-be on :3000 (CLAUDE.md). `/mfa` and
      // `/callback/:provider` render their own guest state without a session.
      url: [
        'http://localhost:5173/',
        'http://localhost:5173/login',
        'http://localhost:5173/mfa',
        'http://localhost:5173/unauthorized',
        'http://localhost:5173/accept-invite/inv_lighthouseprobe00000',
        'http://localhost:5173/callback/google',
        'http://localhost:5173/no-such-route-lighthouse-probe',
      ],
      // vite preview defaults to 4173 — pin it to the URL above.
      startServerCommand: 'pnpm preview --port 5173 --strictPort',
      startServerReadyPattern: 'Local',
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        /*
         * Resource budgets, alongside the category scores.
         *
         * A category score is a blend — a route can take on a hundred kilobytes
         * and still round to the same 0.9, so score alone does not hold a
         * bundle. These name the bytes directly.
         *
         * Pinned above measured with headroom, as a RATCHET: lower them as the
         * routes shrink, never raise them to absorb growth. Byte-level detail
         * per route lives in `pnpm perf:routes`, which measures each public
         * route in a cold context; these are the coarse ceiling that travels
         * with the Lighthouse run.
         */
        'resource-summary:script:size': ['error', { maxNumericValue: 900_000 }],
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 120_000 }],
        'resource-summary:document:size': ['error', { maxNumericValue: 30_000 }],
        'resource-summary:total:size': ['error', { maxNumericValue: 1_600_000 }],
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1.0 }],
        'categories:best-practices': ['warn', { minScore: 0.95 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
