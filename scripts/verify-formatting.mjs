import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// CF-098 AC3 (red-team B-098-3): dates, numbers, units and lists are formatted in one place, core/localization, so every screen shows the
// same Gregorian, Latin-digit patterns. A feature file — code or template (re-audit AA: templates can call toLocale* too) — that calls
// Intl or toLocale* directly fails the build.
// Usage: node scripts/verify-formatting.mjs [root]   (root defaults to src/app; a planted violation can be checked from another root)
const root = process.argv[2]
  ? `${resolve(process.argv[2])}/`
  : fileURLToPath(new URL('../src/app/', import.meta.url));
const pattern =
  /\bIntl\.(NumberFormat|DateTimeFormat|ListFormat|RelativeTimeFormat)\b|\.toLocale(String|DateString|TimeString)\s*\(/;

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) yield* files(`${path}/`);
    else if (
      (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) ||
      entry.name.endsWith('.html')
    )
      yield path;
  }
}

const failures = [];
for await (const path of files(root)) {
  const name = relative(root, path).split('\\').join('/');
  if (name.startsWith('core/localization/')) continue;
  const lines = (await readFile(path, 'utf8')).split('\n');
  lines.forEach((line, index) => {
    if (pattern.test(line)) failures.push(`${name}:${index + 1}: ${line.trim()}`);
  });
}

if (failures.length) {
  console.error(
    `Formatting verification failed — use core/localization (BusinessFormat, labels.ts formatList, zoned-time.ts):\n- ${failures.join('\n- ')}`,
  );
  process.exit(1);
}
console.log('Formatting verification passed: no Intl or toLocale* call outside core/localization.');
