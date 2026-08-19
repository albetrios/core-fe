import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Plugin } from 'vite';

import {
  buildContentSecurityPolicy,
  buildTrustedTypesReportOnlyPolicy,
  formatCspApiConnectSrcFragment,
} from '../src/lib/csp-api-origin.ts';

/** Replaced in index.html connect-src with the API origin from VITE_API_BASE_URL. */
const CSP_API_CONNECT_SRC_PLACEHOLDER = '<!-- CSP_API_CONNECT_SRC -->';

/** The minimal CSP line committed to public/_headers, upgraded at build time. */
const HEADERS_CSP_PLACEHOLDER = "Content-Security-Policy: frame-ancestors 'none'";

/**
 * Injects the production API origin into the Content-Security-Policy in two places:
 *
 *  - `index.html`'s meta CSP (transformIndexHtml) — the parse-time fallback.
 *    ONLY the API origin is injected here; every other token is hand-written in
 *    `index.html`, so parity with the canonical policy is not automatic — it is
 *    asserted by `tests/security/static-security-config.security.test.ts`.
 *  - `dist/_headers`'s `Content-Security-Policy` line (writeBundle) — the
 *    authoritative, header-delivered policy, generated in full from
 *    `buildContentSecurityPolicy`.
 *
 * `reportUri` (VITE_CSP_REPORT_URI) is optional: when set, the header policy
 * carries `report-uri`/`report-to` + a `Reporting-Endpoints` header so
 * production CSP violations are collected.
 */
export function cspApiOrigin(apiBaseUrl: string | undefined, reportUri?: string): Plugin {
  const metaFragment = formatCspApiConnectSrcFragment(apiBaseUrl);
  const headerPolicy = buildContentSecurityPolicy(apiBaseUrl, reportUri);
  const trustedTypesReportOnly = buildTrustedTypesReportOnlyPolicy(reportUri);
  let outDir = 'dist';

  return {
    name: 'csp-api-origin',
    configResolved(resolved) {
      outDir = resolved.build.outDir;
    },
    transformIndexHtml(html) {
      if (!html.includes(CSP_API_CONNECT_SRC_PLACEHOLDER)) {
        return html;
      }
      return html.replace(CSP_API_CONNECT_SRC_PLACEHOLDER, metaFragment);
    },
    writeBundle() {
      const headersPath = resolve(outDir, '_headers');
      let contents: string;
      try {
        contents = readFileSync(headersPath, 'utf8');
      } catch {
        return; // no _headers in this build — nothing to upgrade
      }
      if (!contents.includes(HEADERS_CSP_PLACEHOLDER)) return;
      const reportingHeader = reportUri
        ? `\n  Reporting-Endpoints: csp="${reportUri}"`
        : '';
      // Trusted Types ships report-only alongside the enforcing CSP — a staged
      // rollout that collects DOM-script-sink violations without breaking React
      // / Sentry / PostHog (see buildTrustedTypesReportOnlyPolicy).
      const reportOnlyHeader = `\n  Content-Security-Policy-Report-Only: ${trustedTypesReportOnly}`;
      writeFileSync(
        headersPath,
        contents.replace(
          HEADERS_CSP_PLACEHOLDER,
          `Content-Security-Policy: ${headerPolicy}${reportingHeader}${reportOnlyHeader}`,
        ),
        'utf8',
      );
    },
  };
}
