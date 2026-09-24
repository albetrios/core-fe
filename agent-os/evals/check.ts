#!/usr/bin/env tsx
/**
 * agent-os integrity evals — Tier 1 (core-fe, deterministic).
 *
 * The agent-os/ bundle (skills, rules, agents, docs, hooks) is a large,
 * cross-referenced surface that silently drifts: stale counts, dead path
 * references, index/disk divergence, non-portable hook commands. This gate
 * asserts the structural invariants so drift fails CI instead of being
 * discovered months later by a human audit.
 *
 * Usage:
 *   tsx agent-os/evals/check.ts            # gate: exits 1 on any ERROR
 *   tsx agent-os/evals/check.ts --report   # verbose: list every check + WARNs
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const repositoryRoot = process.cwd();
const agentOsDirectory = join(repositoryRoot, 'agent-os');
const reportMode = process.argv.includes('--report');

type Level = 'error' | 'warn';
interface Finding {
  level: Level;
  check: string;
  message: string;
}

const findings: Finding[] = [];
const error = (check: string, message: string) =>
  findings.push({ level: 'error', check, message });
const warn = (check: string, message: string) =>
  findings.push({ level: 'warn', check, message });

const readText = (absolutePath: string): string => readFileSync(absolutePath, 'utf8');

const listSkillDirectoryNames = (absoluteDirectory: string): string[] =>
  readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();

const listFilesWithExtension = (absoluteDirectory: string, extension: string): string[] =>
  readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name)
    .sort();

/** Extract a single frontmatter field, tolerating folded (`>`) / literal (`|`) scalars. */
function frontmatterField(text: string, key: string): string | undefined {
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!block) return undefined;
  const lines = block.split('\n');
  const index = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
  if (index === -1) return undefined;
  const inline = lines[index].slice(key.length + 1).trim();
  if (inline !== '' && !['>', '|', '>-', '|-'].includes(inline)) return inline;
  const collected: string[] = [];
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    if (/^\s+\S/.test(lines[cursor])) collected.push(lines[cursor].trim());
    else if (/^\s*$/.test(lines[cursor])) continue;
    else break;
  }
  return collected.join(' ').trim() || undefined;
}

function allNumbers(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((match) => Number(match[1]));
}

// ── Skill frontmatter & names ──
const skillDirectoryNames = listSkillDirectoryNames(join(agentOsDirectory, 'skills'));
const skillsWithManifest: string[] = [];

for (const skill of skillDirectoryNames) {
  const skillFile = join(agentOsDirectory, 'skills', skill, 'SKILL.md');
  if (!existsSync(skillFile)) {
    warn(
      'skill-stub',
      `skills/${skill}/ has no SKILL.md (stub directory — add SKILL.md or remove)`,
    );
    continue;
  }
  skillsWithManifest.push(skill);
  const text = readText(skillFile);
  const name = frontmatterField(text, 'name');
  const description = frontmatterField(text, 'description');
  if (!name)
    error('skill-frontmatter', `skills/${skill}/SKILL.md missing frontmatter \`name\``);
  else if (name !== skill)
    error(
      'skill-frontmatter',
      `skills/${skill}/SKILL.md name "${name}" != directory "${skill}" (the declared name must equal the folder, vendored skills included)`,
    );
  if (!description)
    error(
      'skill-frontmatter',
      `skills/${skill}/SKILL.md missing frontmatter \`description\``,
    );
  else if (description.length < 80)
    warn(
      'skill-description',
      `skills/${skill}: description is ${description.length} chars — thin for auto-trigger`,
    );
}

// ── Skill-registry ↔ disk: paths resolve, every skill referenced, count matches ──
const registryFile = join(agentOsDirectory, 'skills', 'fe-skill-registry', 'SKILL.md');
if (existsSync(registryFile)) {
  const registryText = readText(registryFile);
  const registryPaths = new Set(
    [...registryText.matchAll(/\*\*Path:\*\*\s+`([^`]+)`/g)].map((match) =>
      match[1].trim(),
    ),
  );
  for (const path of registryPaths) {
    if (!existsSync(join(repositoryRoot, path)))
      error('skill-registry-path', `fe-skill-registry Path \`${path}\` does not exist`);
  }
  for (const skill of skillsWithManifest) {
    const expected = `agent-os/skills/${skill}/SKILL.md`;
    if (!registryText.includes(expected))
      error(
        'skill-registry-coverage',
        `skill "${skill}" is not referenced in the fe-skill-registry inventory (add an entry with its \`Path:\`)`,
      );
  }
  const claimedCounts = new Set(
    allNumbers(registryText, /Skill Inventory \((\d{1,4}) skills\)/g),
  );
  if (claimedCounts.size === 0)
    error(
      'skill-registry-count',
      'fe-skill-registry is missing a gate-able count — the "## Skill Inventory (N skills)" header',
    );
  for (const count of claimedCounts)
    if (count !== skillsWithManifest.length)
      error(
        'skill-registry-count',
        `fe-skill-registry states ${count} skills; ${skillsWithManifest.length} SKILL.md files exist`,
      );
}

// ── Vendored skills: skills-lock.json hashes match the committed files ──
// skills-lock.json records the sha256 of every ecosystem skill installed via the
// skills CLI. Recompute each and fail on mismatch so an unintended edit to a
// vendored skill (or a stale lock) is caught, not silently accepted.
const skillsLockFile = join(agentOsDirectory, 'skills-lock.json');
if (existsSync(skillsLockFile)) {
  try {
    const lock = JSON.parse(readText(skillsLockFile)) as {
      skills?: Record<string, { skillPath?: string; computedHash?: string }>;
    };
    for (const [name, entry] of Object.entries(lock.skills ?? {})) {
      if (!entry.skillPath) {
        error('skills-lock', `skills-lock entry "${name}" has no skillPath`);
        continue;
      }
      const absolute = join(repositoryRoot, entry.skillPath);
      if (!existsSync(absolute)) {
        error(
          'skills-lock',
          `skills-lock entry "${name}" → ${entry.skillPath} does not exist`,
        );
        continue;
      }
      const actual = createHash('sha256').update(readFileSync(absolute)).digest('hex');
      if (entry.computedHash !== actual)
        error(
          'skills-lock',
          `skills-lock hash mismatch for "${name}" (${entry.skillPath}): expected ${entry.computedHash}, got ${actual}`,
        );
    }
  } catch {
    error('skills-lock', 'agent-os/skills-lock.json is not valid JSON');
  }
}

// ── Agent frontmatter ──
const agentFiles = listFilesWithExtension(join(agentOsDirectory, 'agents'), '.md').filter(
  (file) => file !== 'README.md',
);
for (const file of agentFiles) {
  const text = readText(join(agentOsDirectory, 'agents', file));
  const agentName = basename(file, '.md');
  const name = frontmatterField(text, 'name');
  const description = frontmatterField(text, 'description');
  if (!name || name !== agentName)
    error('agent-frontmatter', `agents/${file} name "${name ?? '∅'}" != "${agentName}"`);
  if (!description)
    error('agent-frontmatter', `agents/${file} missing frontmatter \`description\``);
}

// ── Read-only agents must enforce read-only via a tools allowlist ──
// `readonly: true` is honoured only by Cursor; on Claude Code an agent without a
// `tools` allowlist can still Edit/Write. Require every readonly agent to declare
// `tools` and to exclude the write tools, so the read-only contract is real on
// both platforms.
const writeTools = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
for (const file of agentFiles) {
  const text = readText(join(agentOsDirectory, 'agents', file));
  if (frontmatterField(text, 'readonly') !== 'true') continue;
  const tools = frontmatterField(text, 'tools');
  if (!tools)
    error(
      'agent-readonly',
      `agents/${file} is readonly:true but declares no \`tools\` allowlist — read-only is unenforced on Claude`,
    );
  else {
    const offenders = writeTools.filter((tool) =>
      new RegExp(`\\b${tool}\\b`).test(tools),
    );
    if (offenders.length)
      error(
        'agent-readonly',
        `agents/${file} is readonly:true but its \`tools\` allowlist includes write tool(s): ${offenders.join(', ')}`,
      );
  }
}

// ── Agent catalog ↔ disk: gate-able count matches, every agent catalogued ──
const catalogFile = join(agentOsDirectory, 'docs', 'agents-catalog.md');
if (existsSync(catalogFile)) {
  const catalogText = readText(catalogFile);
  const claimedAgents = new Set(
    allNumbers(catalogText, /## Catalog \((\d{1,3}) agents\)/g),
  );
  if (claimedAgents.size === 0)
    error(
      'agent-catalog',
      'agents-catalog.md is missing a gate-able count — the "## Catalog (N agents)" header',
    );
  for (const count of claimedAgents)
    if (count !== agentFiles.length)
      error(
        'agent-catalog',
        `agents-catalog states ${count} agents; ${agentFiles.length} agent files exist`,
      );
  for (const file of agentFiles) {
    const agentName = basename(file, '.md');
    if (!catalogText.includes(agentName))
      error(
        'agent-catalog',
        `agent "${agentName}" is not referenced in agents-catalog.md`,
      );
  }
}

// ── Hook portability: no hardcoded home paths; referenced scripts exist ──
const settingsFile = join(agentOsDirectory, 'platforms', 'claude', 'settings.json');
if (existsSync(settingsFile)) {
  let settings: {
    hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  } | null = null;
  try {
    settings = JSON.parse(readText(settingsFile));
  } catch {
    error(
      'hook-portability',
      'agent-os/platforms/claude/settings.json is not valid JSON',
    );
  }
  const commands = Object.values(settings?.hooks ?? {})
    .flat()
    .flatMap((entry) => entry.hooks ?? [])
    .map((hook) => hook.command)
    .filter((command): command is string => typeof command === 'string');
  for (const command of commands) {
    if (/\/Users\/|\/home\/|\/root\//.test(command))
      error(
        'hook-portability',
        `settings.json hook hardcodes an absolute home path — use "$CLAUDE_PROJECT_DIR": ${command}`,
      );
    const scriptReference = command.match(
      /agent-os\/hooks\/[A-Za-z0-9._-]+\.(sh|mjs)/,
    )?.[0];
    if (scriptReference && !existsSync(join(repositoryRoot, scriptReference)))
      error(
        'hook-script',
        `settings.json references hook script ${scriptReference} which does not exist`,
      );
  }
}

// ── Backtick-referenced repo paths in agent-os docs/rules/skills must exist ──
const ignoreFile = join(agentOsDirectory, 'evals', 'ignore.json');
const ignored: string[] = existsSync(ignoreFile)
  ? (JSON.parse(readText(ignoreFile)).paths ?? [])
  : [];
const pathRoots = [
  'src/',
  'tooling/',
  'agent-os/',
  'docs/',
  'tests/',
  '.github/',
  '.husky/',
  'plugins/',
  'public/',
];
const pathExtensions = [
  '.ts',
  '.tsx',
  '.mjs',
  '.json',
  '.md',
  '.mdc',
  '.yml',
  '.yaml',
  '.sh',
  '.txt',
  '.html',
];

const isPathCandidate = (token: string): boolean => {
  if (/[*<>:{}\s]|\.\.|^https?/.test(token)) return false;
  if (ignored.some((entry) => token === entry || token.startsWith(entry))) return false;
  const underRoot = pathRoots.some((root) => token.startsWith(root));
  const hasKnownExtension = pathExtensions.some((extension) => token.endsWith(extension));
  return underRoot && hasKnownExtension;
};

const scanOneFile = (absolutePath: string) => {
  const displayPath = relative(repositoryRoot, absolutePath);
  const text = readText(absolutePath);
  const seen = new Set<string>();
  for (const inline of text.matchAll(/`([^`\n]+)`/g)) {
    const token = inline[1].trim();
    if (seen.has(token) || !isPathCandidate(token)) continue;
    seen.add(token);
    if (!existsSync(join(repositoryRoot, token)))
      error(
        'referenced-path',
        `${displayPath} → \`${token}\` does not exist (fix ref or add to evals/ignore.json)`,
      );
  }
};

const scanForPaths = (absoluteDirectory: string, extension: string) => {
  for (const file of listFilesWithExtension(absoluteDirectory, extension))
    scanOneFile(join(absoluteDirectory, file));
};

scanForPaths(join(agentOsDirectory, 'docs'), '.md');
scanForPaths(join(agentOsDirectory, 'rules'), '.mdc');
for (const skill of skillsWithManifest)
  scanForPaths(join(agentOsDirectory, 'skills', skill), '.md');
for (const rootDoc of ['CLAUDE.md', 'AGENTS.md'])
  if (existsSync(join(repositoryRoot, rootDoc)))
    scanOneFile(join(repositoryRoot, rootDoc));

// ── Backbone manifests: hook scripts exist, capability registry well-formed ──
const hooksManifestFile = join(agentOsDirectory, 'hooks', 'hooks.json');
if (existsSync(hooksManifestFile)) {
  try {
    const manifest = JSON.parse(readText(hooksManifestFile)) as {
      hooks?: Array<{ id?: string; script?: string }>;
    };
    for (const entry of manifest.hooks ?? []) {
      if (!entry.script)
        error('hooks-manifest', `hooks.json entry "${entry.id ?? '∅'}" has no script`);
      else if (!existsSync(join(agentOsDirectory, 'hooks', entry.script)))
        error(
          'hooks-manifest',
          `hooks.json references agent-os/hooks/${entry.script} which does not exist`,
        );
    }
  } catch {
    error('hooks-manifest', 'agent-os/hooks/hooks.json is not valid JSON');
  }
}

const targetsRegistryFile = join(agentOsDirectory, 'platforms', 'targets.json');
if (existsSync(targetsRegistryFile)) {
  try {
    const registry = JSON.parse(readText(targetsRegistryFile)) as {
      agents?: Record<string, unknown>;
    };
    if (!registry.agents || Object.keys(registry.agents).length === 0)
      error('targets-registry', 'platforms/targets.json declares no agents');
  } catch {
    error('targets-registry', 'agent-os/platforms/targets.json is not valid JSON');
  }
}

// ── Skill groups ↔ disk: every skill in exactly one group; no unknown names ──
const groupsFile = join(agentOsDirectory, 'skills', 'groups.json');
if (existsSync(groupsFile)) {
  try {
    const groups =
      (JSON.parse(readText(groupsFile)) as { groups?: Record<string, string[]> })
        .groups ?? {};
    const membership = new Map<string, number>();
    for (const [group, members] of Object.entries(groups))
      for (const member of members) {
        if (!skillDirectoryNames.includes(member))
          error(
            'skill-groups',
            `groups.json group "${group}" lists "${member}" which has no skill directory`,
          );
        membership.set(member, (membership.get(member) ?? 0) + 1);
      }
    for (const skill of skillDirectoryNames) {
      const count = membership.get(skill) ?? 0;
      if (count === 0)
        error('skill-groups', `skill "${skill}" is in no group in groups.json`);
      else if (count > 1)
        error(
          'skill-groups',
          `skill "${skill}" is in ${count} groups in groups.json (expected exactly 1)`,
        );
    }
  } catch {
    error('skill-groups', 'agent-os/skills/groups.json is not valid JSON');
  }
}

// ── Skill chains ↔ disk: every step (and optional step) is a real skill ──
const chainsFile = join(agentOsDirectory, 'skills', 'chains.json');
if (existsSync(chainsFile)) {
  try {
    const chains =
      (
        JSON.parse(readText(chainsFile)) as {
          chains?: Record<string, { steps?: string[]; optional?: string[] }>;
        }
      ).chains ?? {};
    for (const [chain, definition] of Object.entries(chains))
      for (const step of [...(definition.steps ?? []), ...(definition.optional ?? [])])
        if (!skillDirectoryNames.includes(step))
          error(
            'skill-chains',
            `chains.json chain "${chain}" references "${step}" which has no skill directory`,
          );
  } catch {
    error('skill-chains', 'agent-os/skills/chains.json is not valid JSON');
  }
}

// ── Agent pipelines ↔ disk: steps are real agents; handoffs are real skills ──
const pipelinesFile = join(agentOsDirectory, 'agents', 'pipelines.json');
if (existsSync(pipelinesFile)) {
  const agentNames = new Set(agentFiles.map((file) => basename(file, '.md')));
  try {
    const pipelines =
      (
        JSON.parse(readText(pipelinesFile)) as {
          pipelines?: Record<
            string,
            { steps?: string[]; handoff?: Record<string, string> }
          >;
        }
      ).pipelines ?? {};
    for (const [pipeline, definition] of Object.entries(pipelines)) {
      for (const step of definition.steps ?? [])
        if (!agentNames.has(step))
          error(
            'agent-pipelines',
            `pipelines.json pipeline "${pipeline}" references agent "${step}" which has no agent file`,
          );
      for (const [step, skill] of Object.entries(definition.handoff ?? {})) {
        if (!agentNames.has(step))
          error(
            'agent-pipelines',
            `pipelines.json pipeline "${pipeline}" handoff key "${step}" is not an agent`,
          );
        if (!skillDirectoryNames.includes(skill))
          error(
            'agent-pipelines',
            `pipelines.json pipeline "${pipeline}" handoff "${step}" → "${skill}" has no skill directory`,
          );
      }
    }
  } catch {
    error('agent-pipelines', 'agent-os/agents/pipelines.json is not valid JSON');
  }
}

const requirementForm = join(
  repositoryRoot,
  'docs',
  'getting-started',
  'requirement-format.md',
);
if (!existsSync(requirementForm)) {
  error('requirement-form', 'docs/getting-started/requirement-format.md is missing');
}

// ── Command names are unique and never collide with a skill name ──
// Commands are workflows; skills are the granular procedures. A command must not
// shadow a skill (or another command), so routing stays unambiguous across tools.
const commandsDirectory = join(agentOsDirectory, 'commands');
if (existsSync(commandsDirectory)) {
  const seenCommand = new Set<string>();
  for (const file of listFilesWithExtension(commandsDirectory, '.md')) {
    const name = basename(file, '.md');
    if (name === 'README') continue;
    if (seenCommand.has(name))
      error('command-uniqueness', `command "${name}" is defined more than once`);
    seenCommand.add(name);
    if (skillDirectoryNames.includes(name))
      error(
        'command-uniqueness',
        `command "${name}" collides with a skill of the same name`,
      );
  }
}

// ── Repo name prefix: every agent-os item this repo owns starts with `fe-` ──
// core-fe and core-be (`be-`) are often loaded in one session, where a shared name lets
// one repo's skill, agent, command or rule hide the other's. Vendored skills keep their
// upstream names: every skills-lock.json entry, plus the Vercel skills installed outside it.
const repositoryPrefix = 'fe-';
const vendoredSkills = new Set<string>([
  'composition-patterns',
  'react-best-practices',
  'web-design-guidelines',
]);
if (existsSync(skillsLockFile)) {
  try {
    const lock = JSON.parse(readText(skillsLockFile)) as { skills?: Record<string, unknown> };
    for (const vendored of Object.keys(lock.skills ?? {})) vendoredSkills.add(vendored);
  } catch {
    // The skills-lock check above reports a malformed lock file.
  }
}
const requirePrefix = (kind: string, name: string) => {
  if (!name.startsWith(repositoryPrefix))
    error('name-prefix', `${kind} "${name}" must start with "${repositoryPrefix}"`);
};
for (const skill of skillDirectoryNames)
  if (!vendoredSkills.has(skill)) requirePrefix('skill', skill);
for (const file of agentFiles) requirePrefix('agent', basename(file, '.md'));
if (existsSync(commandsDirectory))
  for (const file of listFilesWithExtension(commandsDirectory, '.md'))
    requirePrefix('command', basename(file, '.md'));
for (const file of listFilesWithExtension(join(agentOsDirectory, 'rules'), '.mdc'))
  requirePrefix('rule', basename(file, '.mdc'));

// ── Plugin manifest references resolve to real paths ──
// agent-os/.claude-plugin/plugin.json makes agent-os/ itself the installable
// plugin root, so every component path is agent-os-relative; each must exist so
// the plugin is never broken.
const pluginManifestFile = join(agentOsDirectory, '.claude-plugin', 'plugin.json');
if (existsSync(pluginManifestFile)) {
  try {
    const manifest = JSON.parse(readText(pluginManifestFile)) as Record<string, unknown>;
    const references: string[] = [];
    for (const key of ['commands', 'agents', 'skills']) {
      const value = manifest[key];
      if (Array.isArray(value))
        references.push(
          ...value.filter((entry): entry is string => typeof entry === 'string'),
        );
      else if (typeof value === 'string') references.push(value);
    }
    if (typeof manifest.mcpServers === 'string') references.push(manifest.mcpServers);
    for (const reference of references)
      if (!existsSync(join(agentOsDirectory, reference.replace(/^\.\//, ''))))
        error(
          'plugin-refs',
          `agent-os/.claude-plugin/plugin.json references ${reference} which does not exist`,
        );
  } catch {
    error('plugin-refs', 'agent-os/.claude-plugin/plugin.json is not valid JSON');
  }
}

// ── Report ──
const errors = findings.filter((finding) => finding.level === 'error');
const warnings = findings.filter((finding) => finding.level === 'warn');

const checkLabels: Record<string, string> = {
  'skill-frontmatter': 'Skill frontmatter & names',
  'skill-stub': 'Skill stub directories',
  'skill-registry-path': 'Skill-registry paths',
  'skill-registry-coverage': 'Skill-registry coverage',
  'skill-registry-count': 'Skill-registry counts',
  'skill-description': 'Skill descriptions',
  'skills-lock': 'Vendored skill hashes',
  'agent-frontmatter': 'Agent frontmatter',
  'agent-catalog': 'Agent catalog ↔ disk',
  'command-uniqueness': 'Command names unique',
  'agent-readonly': 'Read-only agents enforce tools',
  'hook-portability': 'Hook portability',
  'hook-script': 'Hook scripts exist',
  'referenced-path': 'Referenced paths exist',
  'hooks-manifest': 'Hook manifest scripts exist',
  'targets-registry': 'Capability registry valid',
  'skill-groups': 'Skill groups ↔ disk',
  'skill-chains': 'Skill chains ↔ disk',
  'agent-pipelines': 'Agent pipelines ↔ disk',
  'requirement-form': 'Requirement intake doc',
  'plugin-refs': 'Plugin manifest references',
  'name-prefix': 'Repo name prefix (fe-)',
};

console.log('\nagent-os integrity evals (Tier 1 — core-fe)\n');
console.log(
  `  skills (SKILL.md): ${skillsWithManifest.length}   skill dirs: ${skillDirectoryNames.length}   agents: ${agentFiles.length}\n`,
);

const group = (level: Level) => {
  const list = findings.filter((finding) => finding.level === level);
  const byCheck = new Map<string, string[]>();
  for (const finding of list)
    byCheck.set(finding.check, [...(byCheck.get(finding.check) ?? []), finding.message]);
  return byCheck;
};

if (errors.length || reportMode) {
  for (const [check, messages] of group('error')) {
    console.log(`  ✗ ${checkLabels[check] ?? check}`);
    for (const message of messages) console.log(`      ${message}`);
  }
}
if (warnings.length) {
  for (const [check, messages] of group('warn')) {
    console.log(`  ⚠ ${checkLabels[check] ?? check} (${messages.length})`);
    if (reportMode) for (const message of messages) console.log(`      ${message}`);
  }
}

if (reportMode) {
  const checksWithFindings = new Set(findings.map((finding) => finding.check));
  for (const [check, label] of Object.entries(checkLabels))
    if (!checksWithFindings.has(check)) console.log(`  ✓ ${label}`);
}

console.log('');
if (errors.length) {
  console.log(
    `✗ FAILED — ${errors.length} integrity error(s), ${warnings.length} warning(s)\n`,
  );
  process.exit(1);
}
console.log(`✓ PASSED — 0 errors, ${warnings.length} warning(s)\n`);
