/**
 * Branch-wise client-env deploy checks.
 *
 * Resolves a deploy environment, then enforces that environment's profile from
 * `src/core/config/env-schema.ts`:
 *   - `required` keys are checked against the resolved runtime env (process.env,
 *     as loaded/injected for the deploy job).
 *   - `forbidden` keys are checked against git-TRACKED `.env` + `.env.<env>` files
 *     only; gitignored local files (e.g. `.env.local` with auto-managed
 *     SONAR_* + machine secrets) are skipped, so local secrets never trip a guard.
 *     Deploy env comes from GitHub Environments and is covered by `required`.
 *   - `allowed` values are enforced strictly (HARD FAIL) against the per-env
 *     `.env.<env>` file (locally) or the injected GitHub Environment (CI) — e.g.
 *     production permits only the safe value for each diagnostics flag.
 *
 * Environment resolution (first match wins):
 *   1. `--env <local|development|production>`
 *   2. branch → env via `branchEnvironmentMap` (CI `GITHUB_REF_NAME`, else `git`)
 *   3. legacy `--production` CLI flag (NODE_ENV/VITE_MODE are NOT consulted)
 *   4. otherwise: skip (unmapped feature branch)
 *
 * Usage:
 *   pnpm validate:client-env --production
 *   pnpm validate:client-env --env production
 *   pnpm validate:client-env            # auto-detect from current branch
 */
import '../load-env-files.mjs';

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'dotenv';

import {
  type AppEnvironment,
  environmentForBranch,
  envProfiles,
} from '../../src/core/config/env-schema.ts';

const projectRoot = resolve(import.meta.dirname, '../..');

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) return process.argv[index + 1];
  return undefined;
}

function currentBranch(): string | undefined {
  const fromCi = process.env.GITHUB_REF_NAME;
  if (fromCi) return fromCi;
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- fixed 'git' binary, no user input
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

function isAppEnvironment(value: string | undefined): value is AppEnvironment {
  return value === 'local' || value === 'development' || value === 'production';
}

function resolveEnvironment(): AppEnvironment | undefined {
  const explicit = argValue('--env');
  if (explicit) {
    if (!isAppEnvironment(explicit)) {
      console.error(
        `client-env: unknown --env "${explicit}" (local|development|production)`,
      );
      process.exit(1);
    }
    return explicit;
  }

  const fromBranch = environmentForBranch(currentBranch());
  if (fromBranch) return fromBranch;

  // Legacy `--production` CLI flag only — no NODE_ENV/VITE_MODE env checks.
  if (process.argv.includes('--production')) return 'production';

  return undefined;
}

/** Runtime env (loaded by load-env-files / injected by CI) — for required keys. */
function runtimeGet(key: string): string | undefined {
  const value = process.env[key];
  return value === '' ? undefined : value;
}

/** True when `relPath` is gitignored (`git check-ignore` exits 0). */
function isGitIgnored(relPath: string): boolean {
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- fixed 'git' binary, no user input
    execFileSync('git', ['check-ignore', '-q', relPath], {
      cwd: projectRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Git-TRACKED `.env` + `.env.<env>` only — for forbidden-secret checks. Gitignored
 * local files (e.g. `.env.local` holding auto-managed SONAR_* + machine
 * secrets) are skipped: they never deploy, and deploy env comes from GitHub
 * Environments. The guard still catches a secret that is actually committed.
 */
function committedEnv(environment: AppEnvironment): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of ['.env', `.env.${environment}`]) {
    const path = resolve(projectRoot, file);
    if (!existsSync(path)) continue;
    if (isGitIgnored(file)) continue;
    for (const [key, value] of Object.entries(parse(readFileSync(path)))) {
      if (value === '') continue;
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Required-key issues, split by severity. A key is satisfied by the runtime env
 * (CI-injected) or the `.env.<env>` file (authoritative for that environment's
 * config locally — same source order as {@link allowedErrors}). Missing keys are
 * hard errors only on CI: locally the deploy runtime env doesn't exist, so a
 * miss is reported as a warning instead of failing the smoke run.
 */
function requiredIssues(environment: AppEnvironment): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fileVals = envFileValues(environment);
  const onCi = process.env.GITHUB_ACTIONS === 'true';
  const get = (key: string): string | undefined => runtimeGet(key) ?? fileVals[key];
  for (const rule of envProfiles[environment].required) {
    const applies = rule.when ? rule.when(get) : true;
    if (!applies || get(rule.key)) continue;
    const detail = rule.condition ? ` (${rule.condition})` : '';
    const message = `${rule.key} is required for ${environment}${detail}`;
    (rule.level === 'warn' || !onCi ? warnings : errors).push(message);
  }
  return { errors, warnings };
}

/** Forbidden-key errors against the committed `.env` + `.env.<env>` layer. */
function forbiddenErrors(
  environment: AppEnvironment,
  committed: Record<string, string>,
): string[] {
  const errors: string[] = [];
  for (const rule of envProfiles[environment].forbidden) {
    const value = committed[rule.key];
    if (value === undefined) continue;
    if (rule.valuePattern && !rule.valuePattern.test(value)) continue;
    errors.push(`${rule.key} must not be set in ${environment} — ${rule.reason}`);
  }
  return errors;
}

/** Non-empty values set in the per-environment file `.env.<env>` (behavior config). */
function envFileValues(environment: AppEnvironment): Record<string, string> {
  const path = resolve(projectRoot, `.env.${environment}`);
  if (!existsSync(path)) return {};
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(parse(readFileSync(path)))) {
    if (value !== '') merged[key] = value;
  }
  return merged;
}

/**
 * Strict per-environment allowed-value errors (hard fail). Checks the `.env.<env>`
 * file (authoritative for that environment's config, locally) and — on CI, where
 * the file isn't checked out — the injected GitHub Environment (`process.env`).
 */
function allowedErrors(environment: AppEnvironment): string[] {
  const allowed = envProfiles[environment].allowed;
  if (!allowed) return [];
  const fileVals = envFileValues(environment);
  const onCi = process.env.GITHUB_ACTIONS === 'true';
  const errors: string[] = [];
  for (const [key, permitted] of Object.entries(allowed)) {
    const value = fileVals[key] ?? (onCi ? runtimeGet(key) : undefined);
    if (value === undefined) continue;
    if (!permitted.includes(value)) {
      errors.push(
        `${key}=${value} is not allowed in ${environment} (allowed: ${permitted.join(' | ')})`,
      );
    }
  }
  return errors;
}

function report(environment: AppEnvironment, errors: string[], warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(`  warn: ${warning}`);
  }
  if (errors.length > 0) {
    console.error(`\n${errors.length} ${environment} client-env error(s):`);
    for (const error of errors) {
      console.error(`  ${error}`);
    }
    console.error('\nSee docs/deployment/runbooks/environment-variables.md');
    process.exit(1);
  }
  console.log('client-env: OK');
}

function main(): void {
  const environment = resolveEnvironment();
  if (!environment) {
    console.log(
      'client-env: skipped (no deploy environment — pass --env, --production, or run on `main`)',
    );
    return;
  }

  const profile = envProfiles[environment];
  console.log(`client-env: validating "${environment}" deploy variables`);
  console.log(
    `  required: ${profile.required.length} · forbidden: ${profile.forbidden.length} · allowed-value keys: ${Object.keys(profile.allowed ?? {}).length}`,
  );

  const required = requiredIssues(environment);
  const errors = [
    ...required.errors,
    ...forbiddenErrors(environment, committedEnv(environment)),
    ...allowedErrors(environment),
  ];
  report(environment, errors, required.warnings);
}

main();
