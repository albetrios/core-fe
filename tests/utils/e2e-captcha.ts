import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import {
  CAPTCHA_TOKEN_HEADER,
  DEFAULT_CAPTCHA_BYPASS_HEADER,
  DEV_CAPTCHA_TOKEN,
  TURNSTILE_DUMMY_TOKEN,
} from '@/shared/auth/captcha/captcha.constants.ts';

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Written by `tests/e2e/global-setup.ts`; gitignored. */
export const E2E_AUTH_HEADERS_CACHE = path.join(E2E_DIR, '../e2e/.e2e-auth-headers.json');

export function captchaBypassHeaderName(): string {
  return process.env.E2E_CAPTCHA_BYPASS_HEADER ?? DEFAULT_CAPTCHA_BYPASS_HEADER;
}

export function captchaBypassHeaderValue(): string {
  return process.env.E2E_CAPTCHA_BYPASS_VALUE ?? 'true';
}

/** Fallback when global-setup has not probed yet (bypass + dev token). */
export function defaultE2eAuthHeaders(): Record<string, string> {
  return {
    [captchaBypassHeaderName()]: captchaBypassHeaderValue(),
    [CAPTCHA_TOKEN_HEADER]: DEV_CAPTCHA_TOKEN,
  };
}

export function loadCachedE2eAuthHeaders(): Record<string, string> {
  try {
    const raw = fs.readFileSync(E2E_AUTH_HEADERS_CACHE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // global-setup may not have run (unit tests importing helpers)
  }
  return defaultE2eAuthHeaders();
}

export function writeCachedE2eAuthHeaders(headers: Record<string, string>): void {
  fs.mkdirSync(path.dirname(E2E_AUTH_HEADERS_CACHE), { recursive: true });
  fs.writeFileSync(E2E_AUTH_HEADERS_CACHE, `${JSON.stringify(headers, null, 2)}\n`);
}

function probeEmail(): string {
  return `captcha-probe-${Date.now()}@e2e.probe`;
}

async function sendCodeAcceptsHeaders(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/email/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ email: probeEmail() }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.status === 201;
  } catch {
    return false;
  }
}

/**
 * Probes core-be public auth to find captcha headers that pass `captchaPreHandler`.
 * Order: bypass only → Turnstile dummy → dev token → bypass + dummy.
 */
export async function probeE2eAuthHeaders(
  baseUrl = 'http://localhost:3000',
): Promise<Record<string, string>> {
  const bypassOnly = { [captchaBypassHeaderName()]: captchaBypassHeaderValue() };
  const dummyOnly = { [CAPTCHA_TOKEN_HEADER]: TURNSTILE_DUMMY_TOKEN };
  const devOnly = { [CAPTCHA_TOKEN_HEADER]: DEV_CAPTCHA_TOKEN };
  const bypassAndDummy = {
    ...bypassOnly,
    [CAPTCHA_TOKEN_HEADER]: TURNSTILE_DUMMY_TOKEN,
  };

  for (const candidate of [bypassOnly, dummyOnly, devOnly, bypassAndDummy]) {
    if (await sendCodeAcceptsHeaders(baseUrl, candidate)) {
      return candidate;
    }
  }

  console.warn(
    [
      'E2E captcha probe: no header set succeeded on POST /auth/email/send-code.',
      'Using bypass + dev token fallback.',
      'Local fix: set core-be CAPTCHA_BYPASS_HEADER=X-Captcha-Bypass (non-production NODE_ENV),',
      'or CAPTCHA_PROVIDER=disabled, or align Turnstile test keys on both repos.',
    ].join(' '),
  );
  return defaultE2eAuthHeaders();
}

const captchaRouteInstalled = new WeakSet<Page>();

/**
 * Adds probed captcha headers to browser-initiated POST /api/v1/auth/* calls so UI login
 * flows work when core-be enforces Turnstile (without waiting on the invisible widget).
 */
export async function installE2eCaptchaHeadersOnAuthApi(page: Page): Promise<void> {
  if (captchaRouteInstalled.has(page)) return;
  captchaRouteInstalled.add(page);
  const headers = loadCachedE2eAuthHeaders();
  await page.route('**/api/v1/auth/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.continue({
      headers: {
        ...request.headers(),
        ...headers,
      },
    });
  });
}
