#!/usr/bin/env node
/**
 * Ban bare Intl / toLocale* formatters outside the i18n kernel + vendored ui.
 * App code must use useLocaleFormat / format*Value so Appearance prefs apply.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

let out = '';
try {
  out = execFileSync(
    'rg',
    [
      '-n',
      '--glob',
      '*.ts',
      '--glob',
      '*.tsx',
      '-e',
      '\\.toLocaleString\\(',
      '-e',
      '\\.toLocaleDateString\\(',
      '-e',
      '\\.toLocaleTimeString\\(',
      '-e',
      'new Intl\\.(DateTimeFormat|NumberFormat|RelativeTimeFormat)\\(',
      'src',
    ],
    { encoding: 'utf8', cwd: root },
  );
} catch (err) {
  // rg exits 1 when no matches
  out = typeof err === 'object' && err && 'stdout' in err ? String(err.stdout ?? '') : '';
}

const lines = out
  .split('\n')
  .filter(Boolean)
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

console.log('Bare Intl gate OK — formatters stay in lib/i18n (and vendored ui fallbacks).');
