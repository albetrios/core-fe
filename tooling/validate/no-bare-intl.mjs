#!/usr/bin/env node
/**
 * Ban bare Intl / toLocale* formatters outside the i18n kernel + vendored ui.
 * App code must use useLocaleFormat / format*Value so Appearance prefs apply.
 *
 * Scans in pure Node rather than shelling out to ripgrep: a spawn failure in
 * the previous `rg` implementation was indistinguishable from "no matches", so
 * the gate reported green on any machine without rg installed. No external
 * binary means no such silent pass — and no CI-runner tooling assumption.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = join(root, 'src');

const BANNED = [
  /\.toLocaleString\(/,
  /\.toLocaleDateString\(/,
  /\.toLocaleTimeString\(/,
  /new Intl\.(DateTimeFormat|NumberFormat|RelativeTimeFormat)\(/,
];

const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .map((entry) => entry.split(sep).join('/'))
  .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'));

const matches = [];
for (const relative of files) {
  const text = readFileSync(join(srcDir, relative), 'utf8');
  text.split('\n').forEach((line, index) => {
    if (BANNED.some((pattern) => pattern.test(line))) {
      matches.push(`src/${relative}:${index + 1}:${line.trim()}`);
    }
  });
}

const lines = matches
  .filter((line) => !line.startsWith('src/lib/i18n/'))
  .filter((line) => !line.startsWith('src/shared/components/ui/'))
  .filter((line) => !line.includes('.test.'))
  .filter((line) => !line.includes('.fixtures.'))
  // Placeholder analytics default formatter — only used when no formatLabel passed.
  .filter((line) => !line.includes('dashboard.placeholder-data.ts'));

if (lines.length) {
  console.error('Bare Intl / toLocale* formatter(s) outside lib/i18n (+ vendored ui/):');
  for (const line of lines) console.error(`  ${line}`);
  console.error(
    '\nUse useLocaleFormat() / formatDateValue / formatNumberValue / formatCurrencyValue.',
  );
  process.exit(1);
}

console.log(
  'Bare Intl gate OK — formatters stay in lib/i18n (and vendored ui fallbacks).',
);
