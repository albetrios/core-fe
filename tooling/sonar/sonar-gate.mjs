/**
 * Local SonarQube quality gate (used by the pre-push hook and `pnpm sonar:scan`).
 *
 * Ensures the local SonarQube server is running (auto-starts it if not), provisions an analysis
 * token on first run (stored in the gitignored `.env.local`), runs a scan, waits for the server
 * to finish processing, and then prints any unresolved issues and FAILS (exit 1) if there is at
 * least one — so every Sonar finding on the deployed-app surface must be cleared before code is
 * pushed. Exits 0 when the project is clean.
 *
 * Plain-Node port of core-be's tooling/sonar/sonar-gate.ts (this repo has no tsx runner).
 * Run directly with `pnpm sonar:scan`. See docs/reference/quality/sonarqube-local.md.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PROJECT_KEY = 'core-fe';
const COMPOSE_FILE = 'docker-compose.sonar.yml';
// The single gitignored local env file (`.env.local`, mirroring core-be) — holds
// behavior flags and machine secrets (SONAR_* are auto-managed here and skipped by
// the client-env forbidden guard).
const ENV_LOCAL = '.env.local';
const TOKEN_NAME = 'core-fe-local-gate';
const ADMIN_LOGIN = 'admin';
const SERVER_READY_TIMEOUT_MS = 240_000;
const CE_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 4_000;
// Match docker-compose.sonar.yml host port (9001). Override via SONAR_HOST_URL
// when reusing core-be's server on :9000.
const SONAR_URL =
  process.env.SONAR_HOST_URL ??
  readEnvLocal().SONAR_HOST_URL ??
  'http://localhost:9001';

/** @param {string} message */
function log(message) {
  process.stdout.write(`[sonar-gate] ${message}\n`);
}

/**
 * @param {string} message
 * @returns {never}
 */
function die(message) {
  process.stderr.write(`\n[sonar-gate] ✗ ${message}\n`);
  process.exit(1);
}

/** Parses `.env.local` into a key→value map (quotes stripped); returns {} when absent. */
function readEnvLocal() {
  if (!existsSync(ENV_LOCAL)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(rawLine.trim());
    if (match?.[1]) out[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Inserts/updates the given keys in `.env.local`, preserving all other lines.
 * @param {Record<string, string>} updates
 */
function upsertEnvLocal(updates) {
  const existing = existsSync(ENV_LOCAL)
    ? readFileSync(ENV_LOCAL, 'utf8').split('\n')
    : [];
  const updateKeys = new Set(Object.keys(updates));
  const kept = existing.filter((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line.trim());
    return !(match?.[1] && updateKeys.has(match[1]));
  });
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  if (kept.length > 0)
    kept.push('# SonarQube local quality gate (generated; gitignored)');
  for (const [key, value] of Object.entries(updates)) kept.push(`${key}=${value}`);
  writeFileSync(ENV_LOCAL, `${kept.join('\n')}\n`);
}

/**
 * @param {string} path
 * @param {{ method?: 'GET' | 'POST', basicAuth?: string, form?: Record<string, string> }} [options]
 * @returns {Promise<Response>}
 */
async function sonarApi(path, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (options.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(options.basicAuth).toString('base64')}`;
  }
  /** @type {RequestInit} */
  const init = { method: options.method ?? 'GET', headers };
  if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(options.form).toString();
  }
  try {
    return await fetch(`${SONAR_URL}${path}`, init);
  } catch {
    return new Response(null, { status: 503 });
  }
}

/**
 * @param {string[]} args
 * @param {Record<string, string>} [extraEnv]
 */
function dockerCompose(args, extraEnv = {}) {
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  return result.status ?? 1;
}

/** Starts the SonarQube container if it is not already accepting requests, then waits for UP. */
async function ensureServerUp() {
  const status = await sonarApi('/api/system/status');
  if (status.ok) {
    const parsed = await status.json();
    if (parsed.status === 'UP') return;
  }

  log('SonarQube not ready — starting it (first boot can take ~2 min)…');
  if (dockerCompose(['up', '-d', 'sonarqube']) !== 0) {
    die('failed to start SonarQube (is Docker running?). Start it with `pnpm sonar:up`.');
  }

  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const probe = await sonarApi('/api/system/status');
    if (probe.ok) {
      const parsed = await probe.json();
      if (parsed.status === 'UP') {
        log('SonarQube is UP.');
        return;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  die(
    'SonarQube did not become ready in time. Check `docker compose -f docker-compose.sonar.yml logs sonarqube`.',
  );
}

/** @param {string} token */
async function tokenIsValid(token) {
  const response = await sonarApi('/api/authentication/validate', {
    basicAuth: `${token}:`,
  });
  if (!response.ok) return false;
  const parsed = await response.json();
  return parsed.valid === true;
}

function generateLocalAdminPassword() {
  return `Sonar1!${randomBytes(12).toString('base64url')}`;
}

/**
 * Returns a valid analysis token, provisioning one on first run: changes the default `admin/admin`
 * password to a generated one (stored in `.env.local`) and mints a token. Idempotent thereafter.
 */
async function ensureToken() {
  const env = readEnvLocal();
  if (env.SONAR_TOKEN && (await tokenIsValid(env.SONAR_TOKEN))) {
    return env.SONAR_TOKEN;
  }

  log('Provisioning a SonarQube token…');
  let adminPassword = env.SONAR_ADMIN_PASSWORD;

  if (!adminPassword) {
    const defaultWorks = await sonarApi('/api/authentication/validate', {
      basicAuth: `${ADMIN_LOGIN}:admin`,
    });
    const defaultValid = defaultWorks.ok && (await defaultWorks.json()).valid === true;
    if (!defaultValid) {
      die(
        'SonarQube admin password is unknown (not the default and not in .env.local).\n' +
          "  If core-be's SonarQube owns port 9000, copy SONAR_ADMIN_PASSWORD from core-be/.env.local\n" +
          "  into this repo's .env.local. Otherwise reset the instance with `pnpm sonar:reset`.",
      );
    }
    adminPassword = generateLocalAdminPassword();
    const changed = await sonarApi('/api/users/change_password', {
      method: 'POST',
      basicAuth: `${ADMIN_LOGIN}:admin`,
      form: { login: ADMIN_LOGIN, previousPassword: 'admin', password: adminPassword },
    });
    if (!changed.ok && changed.status !== 204) {
      die(`failed to set the local SonarQube admin password (HTTP ${changed.status}).`);
    }
  }

  await sonarApi('/api/user_tokens/revoke', {
    method: 'POST',
    basicAuth: `${ADMIN_LOGIN}:${adminPassword}`,
    form: { name: TOKEN_NAME },
  });
  let generated = await sonarApi('/api/user_tokens/generate', {
    method: 'POST',
    basicAuth: `${ADMIN_LOGIN}:${adminPassword}`,
    form: { name: TOKEN_NAME },
  });
  if (generated.status === 401) {
    // Stored credentials belong to a previous server (e.g. core-be's instance
    // owned port 9000 before; this is a fresh container with admin/admin).
    // Re-provision from the default instead of dying.
    log('Stored admin password rejected — re-provisioning against a fresh instance…');
    const fresh = generateLocalAdminPassword();
    const changed = await sonarApi('/api/users/change_password', {
      method: 'POST',
      basicAuth: `${ADMIN_LOGIN}:admin`,
      form: { login: ADMIN_LOGIN, previousPassword: 'admin', password: fresh },
    });
    if (changed.ok || changed.status === 204) {
      adminPassword = fresh;
      generated = await sonarApi('/api/user_tokens/generate', {
        method: 'POST',
        basicAuth: `${ADMIN_LOGIN}:${adminPassword}`,
        form: { name: TOKEN_NAME },
      });
    }
  }
  if (!generated.ok) {
    die(
      `failed to mint a SonarQube token (HTTP ${generated.status}). Try \`pnpm sonar:reset\`.`,
    );
  }
  const token = (await generated.json()).token;
  if (!token) die('SonarQube returned no token.');

  upsertEnvLocal({ SONAR_ADMIN_PASSWORD: adminPassword, SONAR_TOKEN: token });
  log('Token provisioned and saved to .env.local.');
  return token;
}

/** @param {string} token */
function runScanner(token) {
  log('Scanning… (this takes ~60–90s)');
  const result = spawnSync(
    'docker',
    ['compose', '-f', COMPOSE_FILE, 'run', '--rm', 'scanner'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, SONAR_TOKEN: token },
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    process.stderr.write(output);
    die('the SonarQube scanner failed (see output above).');
  }
  return output;
}

/**
 * Extracts the Compute Engine task id from the scanner's `…/api/ce/task?id=<id>` log line.
 * @param {string} scannerOutput
 */
function parseCeTaskId(scannerOutput) {
  const match = /ce\/task\?id=([\w-]+)/.exec(scannerOutput);
  if (!match?.[1]) {
    process.stderr.write(scannerOutput);
    die('could not find the analysis task id in the scanner output.');
  }
  return match[1];
}

/**
 * @param {string} token
 * @param {string} taskId
 */
async function waitForAnalysis(token, taskId) {
  log('Waiting for SonarQube to process the report…');
  const deadline = Date.now() + CE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await sonarApi(`/api/ce/task?id=${taskId}`, {
      basicAuth: `${token}:`,
    });
    if (response.ok) {
      const status = (await response.json()).task?.status;
      if (status === 'SUCCESS') return;
      if (status === 'FAILED' || status === 'CANCELED') {
        die(
          `SonarQube analysis ${status.toLowerCase()}. Check the dashboard at ${SONAR_URL}.`,
        );
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  die('timed out waiting for SonarQube to process the analysis.');
}

/**
 * @typedef {{ rule: string, severity: string, component: string, line?: number, message: string }} SonarIssue
 */

/**
 * @param {string} token
 * @returns {Promise<SonarIssue[]>}
 */
async function fetchOpenIssues(token) {
  /** @type {SonarIssue[]} */
  const issues = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await sonarApi(
      `/api/issues/search?componentKeys=${PROJECT_KEY}&resolved=false&ps=100&p=${page}`,
      { basicAuth: `${token}:` },
    );
    if (!response.ok) die(`failed to query SonarQube issues (HTTP ${response.status}).`);
    const parsed = await response.json();
    issues.push(...parsed.issues);
    if (issues.length >= parsed.total || parsed.issues.length === 0) break;
  }
  return issues;
}

/** @param {string} token */
async function fetchOpenHotspots(token) {
  const response = await sonarApi(
    `/api/hotspots/search?projectKey=${PROJECT_KEY}&status=TO_REVIEW&ps=1`,
    { basicAuth: `${token}:` },
  );
  if (!response.ok) return 0;
  return (await response.json()).paging?.total ?? 0;
}

/**
 * @param {SonarIssue[]} issues
 * @param {number} hotspots
 * @returns {never}
 */
function reportAndExit(issues, hotspots) {
  if (issues.length === 0 && hotspots === 0) {
    log(
      `✓ SonarQube clean — 0 issues / 0 hotspots. Dashboard: ${SONAR_URL}/dashboard?id=${PROJECT_KEY}`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `\n[sonar-gate] ✗ SonarQube found ${issues.length} issue(s)` +
      `${hotspots > 0 ? ` and ${hotspots} security hotspot(s) to review` : ''} — fix them before pushing.\n\n`,
  );
  for (const issue of issues.slice(0, 50)) {
    const file = issue.component.includes(':')
      ? issue.component.split(':').slice(1).join(':')
      : issue.component;
    const where = issue.line ? `${file}:${issue.line}` : file;
    process.stderr.write(
      `  ${issue.severity.padEnd(8)} ${issue.rule.padEnd(22)} ${where}\n      ${issue.message}\n`,
    );
  }
  if (issues.length > 50) process.stderr.write(`  … and ${issues.length - 50} more.\n`);
  process.stderr.write(`\n  Full report: ${SONAR_URL}/dashboard?id=${PROJECT_KEY}\n`);
  process.exit(1);
}

async function main() {
  await ensureServerUp();
  const token = await ensureToken();
  const scanOutput = runScanner(token);
  await waitForAnalysis(token, parseCeTaskId(scanOutput));
  const [issues, hotspots] = await Promise.all([
    fetchOpenIssues(token),
    fetchOpenHotspots(token),
  ]);
  reportAndExit(issues, hotspots);
}

main().catch((error) => {
  die(error instanceof Error ? error.message : String(error));
});
