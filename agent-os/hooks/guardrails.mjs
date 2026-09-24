#!/usr/bin/env node
// Claude Code PreToolUse guardrail for core-fe (self-contained — no other repo).
//
// BLOCK (deny): destructive shell commands; writes to secret files / secret content.
// WARN (systemMessage): edits to protected/vendored paths.
//
// Reads the PreToolUse payload on stdin. Fail-open by design: any parse/read
// error allows the tool (exit 0) so a guardrail bug can never brick the agent.
import { readFileSync } from 'node:fs';

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const tool = payload.tool_name || '';
const input = payload.tool_input || {};
const filePath = input.file_path || input.path || '';
const command = input.command || '';
const content = [input.content, input.new_string].filter(Boolean).join('\n');

const warnings = [];

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// --- BLOCK: destructive shell ------------------------------------------------
if (tool === 'Bash' && command) {
  // Scan with quoted strings + heredoc bodies removed, so a destructive pattern
  // that merely appears in a message/echo (e.g. a commit message) won't trigger.
  const scan = command
    .replace(/<<-?\s*['"]?[A-Za-z_]\w*['"]?[\s\S]*$/, ' ')
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ');
  let why = '';
  if (/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i.test(scan)) {
    why = 'recursive force delete (rm -rf)';
  } else if (
    /\bgit\s+push\b/i.test(scan) &&
    (/--force(?!-with-lease)/i.test(scan) || /\s-f(?:\s|$)/.test(scan))
  ) {
    why = 'git push --force (use --force-with-lease, or push it yourself)';
  } else if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(scan)) {
    why = 'fork bomb';
  } else if (/\bmkfs\b|\bdd\s+if=/i.test(scan)) {
    why = 'filesystem-destroying command';
  }
  if (why) {
    deny(
      `Blocked by core-fe guardrail: ${why}. Command: "${command.slice(0, 160)}". If you truly intend this, run it yourself in a terminal.`,
    );
  }
  if (/\bgit\s+reset\s+--hard\b/i.test(scan) || /\bgit\s+clean\s+-[a-z]*f/i.test(scan)) {
    warnings.push(
      `destructive git op ("${command.slice(0, 80)}") discards uncommitted work.`,
    );
  }
}

// --- BLOCK: secrets ----------------------------------------------------------
const isEnvSecretFile =
  /(^|\/)\.env(\.[\w.-]+)?$/.test(filePath) && !/\.env\.example$/.test(filePath);
if ((tool === 'Write' || tool === 'Edit') && isEnvSecretFile) {
  deny(
    `Blocked by core-fe guardrail: "${filePath}" is a gitignored secrets file. Put template keys in .env.example (VITE_ prefix = public) and provide real values via the environment, not source control.`,
  );
}
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  /\bsk_live_[A-Za-z0-9]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
];
if (
  (tool === 'Write' || tool === 'Edit') &&
  content &&
  secretPatterns.some((re) => re.test(content))
) {
  deny(
    'Blocked by core-fe guardrail: the content looks like a private key or live credential. Use environment variables / a secret manager instead of committing secrets.',
  );
}

// --- WARN: protected / vendored paths ----------------------------------------
if ((tool === 'Write' || tool === 'Edit') && filePath) {
  if (/\/components\/ui\/[^/]+\.(tsx?|css)$/.test(filePath)) {
    warnings.push(
      `editing a vendored shadcn/ui primitive (${filePath}) — prefer \`pnpm dlx shadcn@latest add\` / compose around it; hand-edits are lost on re-add (see agent-os/skills/shadcn).`,
    );
  }
  if (/(^|\/)src\/index\.css$/.test(filePath)) {
    warnings.push(
      `editing the Tailwind v4 @theme entry (${filePath}) — keep changes to design tokens; app code must use semantic tokens (pnpm validate:tokens).`,
    );
  }
  if (/routeTree\.tsx$/.test(filePath)) {
    warnings.push(
      `editing the route tree (${filePath}) — keep it in sync with the page manifests + docs/reference/routes-and-ui.md (fe-route-island skill).`,
    );
  }
}

if (warnings.length) {
  process.stdout.write(
    JSON.stringify({ systemMessage: '⚠️ core-fe guardrail:\n- ' + warnings.join('\n- ') }),
  );
}
process.exit(0);
