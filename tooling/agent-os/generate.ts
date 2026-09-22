#!/usr/bin/env tsx
/**
 * agent-os generator — compiles each agent's native wiring FROM the common
 * agent-os/ sources into agent-os/platforms/ (tool dirs symlink there), and
 * (in --check mode) fails when a hand-edited artifact has drifted from that
 * single source.
 *
 * Single source: agent-os/hooks/hooks.json (hook wiring) + agent-os/platforms/
 * targets.json (capability registry). Derived artifacts: the `hooks` block of
 * the Claude settings, the Cursor hooks config, the Codex hooks config, and the
 * default Codex MCP config. Everything else in those files (Claude
 * `permissions`, Cursor `$schema`/`version`) is owned by hand and preserved
 * verbatim. --check compares semantically (parsed, key-order-independent) so
 * the existing hand-formatted files pass unchanged.
 *
 * Usage:
 *   tsx tooling/agent-os/generate.ts            # default: --check (drift gate)
 *   tsx tooling/agent-os/generate.ts --check    # compare generated vs on-disk; exit 1 on drift
 *   tsx tooling/agent-os/generate.ts --write     # write the derived artifacts from source
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const repositoryRoot = process.cwd();
const agentOsDirectory = join(repositoryRoot, 'agent-os');
const writeMode = process.argv.includes('--write');

interface HookManifestEntry {
  id: string;
  runtime: 'bash' | 'node';
  script: string;
  claude?: { event: string; matcher?: string };
  cursor?: { event: string; matcher?: string };
  codex?: { event: string; matcher?: string; statusMessage?: string };
}
interface HookManifest {
  hooks: HookManifestEntry[];
}
interface AgentTarget {
  consumes?: string[];
  capabilities: { hookEvents: string[]; mcpFormat?: string };
  hooksTarget: string | null;
}
interface TargetsRegistry {
  agents: Record<string, AgentTarget>;
}

const readJson = (absolutePath: string): unknown =>
  JSON.parse(readFileSync(absolutePath, 'utf8'));

const problems: string[] = [];
const report = (message: string) => problems.push(message);

const manifest = readJson(join(agentOsDirectory, 'hooks', 'hooks.json')) as HookManifest;
const targets = readJson(
  join(agentOsDirectory, 'platforms', 'targets.json'),
) as TargetsRegistry;

const claudeTarget = targets.agents.claude;
const cursorTarget = targets.agents.cursor;
const codexTarget = targets.agents.codex;

const claudeCommand = (entry: HookManifestEntry): string =>
  `${entry.runtime} "$CLAUDE_PROJECT_DIR/agent-os/hooks/${entry.script}"`;
const cursorCommand = (entry: HookManifestEntry): string =>
  `${entry.runtime} ../agent-os/hooks/${entry.script}`;
const codexCommand = (entry: HookManifestEntry): string =>
  `CLAUDE_PROJECT_DIR="$(git rev-parse --show-toplevel)" ${entry.runtime} "$(git rev-parse --show-toplevel)/agent-os/hooks/${entry.script}"`;

function buildClaudeHooks(): Record<string, unknown[]> {
  const supported = new Set(claudeTarget?.capabilities.hookEvents ?? []);
  // Null-prototype accumulator: the keys below come from the hooks/agent manifests, so a
  // manifest carrying `__proto__` would otherwise reassign this object's prototype instead
  // of adding an own property.
  const grouped = Object.create(null) as Record<string, unknown[]>;
  for (const entry of manifest.hooks) {
    if (!entry.claude) continue;
    if (!supported.has(entry.claude.event)) {
      report(
        `claude: hook "${entry.id}" targets unsupported event ${entry.claude.event} — skipped`,
      );
      continue;
    }
    const command = claudeCommand(entry);
    const hookEntry = entry.claude.matcher
      ? { matcher: entry.claude.matcher, hooks: [{ type: 'command', command }] }
      : { hooks: [{ type: 'command', command }] };
    const event = entry.claude.event;
    grouped[event] = [...(grouped[event] ?? []), hookEntry];
  }
  return grouped;
}

function buildCursorHooks(): Record<string, Array<{ command: string }>> {
  const supported = new Set(cursorTarget?.capabilities.hookEvents ?? []);
  // Null-prototype accumulator: the keys below come from the hooks/agent manifests, so a
  // manifest carrying `__proto__` would otherwise reassign this object's prototype instead
  // of adding an own property.
  const grouped = Object.create(null) as Record<string, Array<{ command: string }>>;
  for (const entry of manifest.hooks) {
    if (!entry.cursor) continue;
    if (!supported.has(entry.cursor.event)) {
      report(
        `cursor: hook "${entry.id}" targets unsupported event ${entry.cursor.event} — skipped`,
      );
      continue;
    }
    const event = entry.cursor.event;
    grouped[event] = [...(grouped[event] ?? []), { command: cursorCommand(entry) }];
  }
  return grouped;
}

function buildCodexHooks(): Record<string, unknown[]> {
  const supported = new Set(codexTarget?.capabilities.hookEvents ?? []);
  // Null-prototype accumulator: the keys below come from the hooks/agent manifests, so a
  // manifest carrying `__proto__` would otherwise reassign this object's prototype instead
  // of adding an own property.
  const grouped = Object.create(null) as Record<string, unknown[]>;
  for (const entry of manifest.hooks) {
    if (!entry.codex) continue;
    if (!supported.has(entry.codex.event)) {
      report(
        `codex: hook "${entry.id}" targets unsupported event ${entry.codex.event} — skipped`,
      );
      continue;
    }
    const hook: { type: 'command'; command: string; statusMessage?: string } = {
      type: 'command',
      command: codexCommand(entry),
    };
    if (entry.codex.statusMessage) hook.statusMessage = entry.codex.statusMessage;
    const hookEntry = entry.codex.matcher
      ? { matcher: entry.codex.matcher, hooks: [hook] }
      : { hooks: [hook] };
    const event = entry.codex.event;
    grouped[event] = [...(grouped[event] ?? []), hookEntry];
  }
  return grouped;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    // Same reasoning as `grouped` above: keys are manifest-derived.
    const sorted = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort())
      sorted[key] = canonical((value as Record<string, unknown>)[key]);
    return sorted;
  }
  return value;
}

const deepEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function toCodexToml(
  servers: Record<string, { command?: string; args?: string[] }>,
): string {
  const lines = [
    '# Generated by tooling/agent-os/generate.ts from agent-os/mcp/mcp.default.json — do not edit by hand.',
    '',
  ];
  for (const [name, definition] of Object.entries(servers)) {
    lines.push(`[mcp_servers.${name}]`);
    if (definition.command) lines.push(`command = ${JSON.stringify(definition.command)}`);
    if (definition.args?.length)
      lines.push(
        `args = [${definition.args.map((argument) => JSON.stringify(argument)).join(', ')}]`,
      );
    lines.push('');
  }
  return lines.join('\n');
}

const claudeHooks = buildClaudeHooks();
const cursorHooks = buildCursorHooks();
const codexHooks = buildCodexHooks();

// ── hookEvent coverage: targets.json must fully declare what hooks.json uses,
// and every declared+used event must survive into the generated config. This
// closes the silent hole where a hook targeting an undeclared event is skipped
// with no drift (the on-disk config was generated the same way, so it matches).
function eventsUsedBy(agent: 'claude' | 'cursor' | 'codex'): Set<string> {
  const used = new Set<string>();
  for (const entry of manifest.hooks) {
    const wiring = entry[agent];
    if (wiring) used.add(wiring.event);
  }
  return used;
}

const generatedEventsByAgent: Record<'claude' | 'cursor' | 'codex', string[]> = {
  claude: Object.keys(claudeHooks),
  cursor: Object.keys(cursorHooks),
  codex: Object.keys(codexHooks),
};

for (const agent of ['claude', 'cursor', 'codex'] as const) {
  const declared = new Set(targets.agents[agent]?.capabilities.hookEvents ?? []);
  const used = eventsUsedBy(agent);
  const generated = new Set(generatedEventsByAgent[agent]);
  for (const event of used) {
    if (!declared.has(event))
      report(
        `coverage: ${agent} hooks.json uses event "${event}" not declared in targets.json hookEvents — declare it or the hook is silently dropped`,
      );
    else if (!generated.has(event))
      report(
        `coverage: ${agent} declared+used event "${event}" is missing from the generated hook config`,
      );
  }
}

const claudeSettingsPath = join(
  repositoryRoot,
  claudeTarget?.hooksTarget ?? 'agent-os/platforms/claude/settings.json',
);
if (existsSync(claudeSettingsPath)) {
  const settings = readJson(claudeSettingsPath) as { hooks?: unknown };
  if (writeMode) {
    if (!deepEqual(settings.hooks, claudeHooks)) {
      settings.hooks = claudeHooks;
      writeFileSync(claudeSettingsPath, `${JSON.stringify(settings, null, 2)}\n`);
      report('wrote agent-os/platforms/claude/settings.json');
    }
  } else if (!deepEqual(settings.hooks, claudeHooks)) {
    report(
      'drift: agent-os/platforms/claude/settings.json hooks differ from agent-os/hooks/hooks.json — run `pnpm agent-os:generate`',
    );
  }
} else report(`missing: ${claudeSettingsPath}`);

const cursorHooksPath = join(
  repositoryRoot,
  cursorTarget?.hooksTarget ?? 'agent-os/platforms/cursor/hooks.json',
);
if (existsSync(cursorHooksPath)) {
  const cursorConfig = readJson(cursorHooksPath) as { hooks?: unknown };
  if (writeMode) {
    if (!deepEqual(cursorConfig.hooks, cursorHooks)) {
      cursorConfig.hooks = cursorHooks;
      writeFileSync(cursorHooksPath, `${JSON.stringify(cursorConfig, null, 2)}\n`);
      report('wrote agent-os/platforms/cursor/hooks.json');
    }
  } else if (!deepEqual(cursorConfig.hooks, cursorHooks)) {
    report(
      'drift: agent-os/platforms/cursor/hooks.json differs from agent-os/hooks/hooks.json — run `pnpm agent-os:generate`',
    );
  }
} else report(`missing: ${cursorHooksPath}`);

const codexHooksPath = join(
  repositoryRoot,
  codexTarget?.hooksTarget ?? 'agent-os/platforms/codex/hooks.json',
);
const codexHooksFile = { hooks: codexHooks };
if (writeMode) {
  const current = existsSync(codexHooksPath) ? readJson(codexHooksPath) : null;
  if (!deepEqual(current, codexHooksFile)) {
    mkdirSync(dirname(codexHooksPath), { recursive: true });
    writeFileSync(codexHooksPath, `${JSON.stringify(codexHooksFile, null, 2)}\n`);
    report('wrote agent-os/platforms/codex/hooks.json');
  }
} else if (!existsSync(codexHooksPath)) {
  report(`missing: ${codexHooksPath}`);
} else if (!deepEqual(readJson(codexHooksPath), codexHooksFile)) {
  report(
    'drift: agent-os/platforms/codex/hooks.json differs from agent-os/hooks/hooks.json — run `pnpm agent-os:generate`',
  );
}

if (
  codexTarget?.capabilities.mcpFormat === 'toml' &&
  codexTarget?.consumes?.includes('mcp')
) {
  const mcpDefaultPath = join(agentOsDirectory, 'mcp', 'mcp.default.json');
  const codexConfigPath = join(agentOsDirectory, 'platforms', 'codex', 'config.toml');
  if (existsSync(mcpDefaultPath)) {
    const servers =
      (
        readJson(mcpDefaultPath) as {
          mcpServers?: Record<string, { command?: string; args?: string[] }>;
        }
      ).mcpServers ?? {};
    const toml = toCodexToml(servers);
    const current = existsSync(codexConfigPath)
      ? readFileSync(codexConfigPath, 'utf8')
      : null;
    if (writeMode) {
      if (current !== toml) {
        mkdirSync(dirname(codexConfigPath), { recursive: true });
        writeFileSync(codexConfigPath, toml);
        report('wrote agent-os/platforms/codex/config.toml');
      }
    } else if (current !== toml) {
      report(
        'drift: agent-os/platforms/codex/config.toml differs from agent-os/mcp/mcp.default.json — run `pnpm agent-os:generate`',
      );
    }
  }
}

// `coverage:` problems are a fault in BOTH modes (they signal a targets.json /
// hooks.json mismatch, not a re-runnable drift), so they fail even under --write.
const coverageFaults = problems.filter((message) => message.startsWith('coverage'));
const drift = problems.filter(
  (message) => message.startsWith('drift') || message.startsWith('missing'),
);
console.log(`\nagent-os generate (${writeMode ? 'write' : 'check'})\n`);
console.log(`  agents: ${Object.keys(targets.agents).join(', ')}`);
console.log(
  `  claude hooks: ${Object.values(claudeHooks).flat().length}   cursor hooks: ${Object.values(cursorHooks).flat().length}   codex hooks: ${Object.values(codexHooks).flat().length}\n`,
);
for (const message of problems) console.log(`  • ${message}`);
console.log('');
if (coverageFaults.length) {
  console.log(
    `✗ COVERAGE — ${coverageFaults.length} hookEvent coverage fault(s) between targets.json and hooks.json\n`,
  );
  process.exit(1);
}
if (!writeMode && drift.length) {
  console.log(
    `✗ DRIFT — ${drift.length} derived artifact(s) out of sync with agent-os/\n`,
  );
  process.exit(1);
}
console.log(`✓ ${writeMode ? 'wrote derived artifacts' : 'in sync — no drift'}\n`);
