import { readFile, readdir } from 'node:fs/promises';
// Post-build localization contract: catalogues agree, each build declares its language/direction,
// and Arabic typography ships as bundled same-origin WOFF2 selected only by the Arabic document.
const root = new URL('../', import.meta.url);
const browser = new URL('dist/subcontractor-intelligence/browser/', root);
const failures = [];
const check = (condition, message) => condition || failures.push(message);
const placeholders = (text) => (text.match(/\{\$[A-Z_]+\}/g) ?? []).sort().join();

const source = JSON.parse(
  await readFile(new URL('src/locale/messages.en.json', root)),
).translations;
const arabic = JSON.parse(
  await readFile(new URL('src/locale/messages.ar.json', root)),
).translations;
for (const id of Object.keys(source)) {
  check(typeof arabic[id] === 'string' && arabic[id].trim(), `ar: missing translation ${id}`);
  if (arabic[id])
    check(placeholders(arabic[id]) === placeholders(source[id]), `ar: placeholders ${id}`);
}
for (const id of Object.keys(arabic)) check(id in source, `ar: obsolete message ${id}`);
// CF-089: customers never read build-phase jargon ("Part 11", "ADR-074", "الجزء 11").
const jargon = /\bPart \d+\b|\bADR-\d+\b|الجزء \d+/;
for (const [name, catalogue] of [
  ['en', source],
  ['ar', arabic],
])
  for (const [id, text] of Object.entries(catalogue))
    check(!jargon.test(text), `${name}: build-phase jargon in ${id}`);

for (const [locale, direction] of [
  ['en', 'ltr'],
  ['ar', 'rtl'],
]) {
  const html = await readFile(new URL(`${locale}/index.html`, browser), 'utf8');
  check(html.includes(`<html lang="${locale}" dir="${direction}">`), `${locale}: lang/dir`);
  check(html.includes(`<base href="/${locale}/"`), `${locale}: base href`);
}

const arFiles = await readdir(new URL('ar/', browser));
const css = await readFile(
  new URL(`ar/${arFiles.find((name) => /^styles-.*\.css$/.test(name))}`, browser),
  'utf8',
);
const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
check(faces.length === 3, `ar: expected 3 @font-face rules, found ${faces.length}`);
const weights = [];
for (const face of faces) {
  const url = /url\((\/ar\/fonts\/ibm-plex-sans-arabic\/[\w-]+\.woff2)\) format\("woff2"\)/.exec(
    face,
  );
  check(face.includes('IBM Plex Sans Arabic') && url, `ar: unexpected @font-face ${face}`);
  weights.push(/font-weight:(\d+)/.exec(face)?.[1]);
  if (url) {
    const font = await readFile(new URL(`.${url[1]}`, browser)).catch(() => null);
    check(font?.subarray(0, 4).toString() === 'wOF2', `ar: missing or invalid WOFF2 ${url[1]}`);
  }
}
check(weights.sort().join() === '400,600,700', `ar: font weights ${weights.join()}`);
await readFile(new URL('ar/fonts/ibm-plex-sans-arabic/LICENSE.txt', browser)).catch(() =>
  failures.push('ar: OFL licence not shipped with the fonts'),
);
const arabicRoot = /:root:lang\(ar\)\{([^}]*)\}/.exec(css)?.[1] ?? '';
for (const token of ['--font-body', '--font-display', '--font-ui', '--font-label'])
  check(new RegExp(`${token}: *"IBM Plex Sans Arabic"`).test(arabicRoot), `ar: ${token} token`);
check(!/:root\{[^}]*Plex/.test(css), 'en: default tokens must not use the Arabic family');
check(
  /html:lang\(ar\) body \*:not\(:lang\(en\)\)\{letter-spacing:normal!important;text-transform:none!important\}/.test(
    css,
  ),
  'ar: Latin tracking/uppercase reset',
);
check(!/url\(["']?(https?:)?\/\//.test(css), 'css: external font or asset URL');

// Re-audit R-16: every message id the lifecycle glossary names exists in the catalogue (the glossary drifted once). The docs are not in
// the frontend image's build context, so this runs in the repository only.
const glossary = await readFile(
  new URL('../docs/project/LIFECYCLE_GLOSSARY.md', root),
  'utf8',
).catch(() => null);
if (glossary !== null) {
  const rows = new Map();
  for (const [, id, english, arabicText] of glossary.matchAll(
    /^\| `([A-Za-z0-9_.]+)` \| (.*?) \| (.*?) \|$/gm,
  )) {
    rows.set(id, { english, arabic: arabicText });
    check(id in source, `glossary: ${id} is not in the catalogue`);
  }
  // CF-017 AC1 (red-team B-017-1): every status chip has a glossary row, and every row says what the catalogue says, in both languages
  // (re-audit V: every parsed row is compared, not only the status chips). Placeholders compare as {…} (the glossary writes {date} where
  // the catalogue holds tags and an interpolation).
  const status =
    /^[A-Za-z]*(Status|Lifecycle|Stage|State|Step)\.|^lifecycle\.|^status\.|^standing\./;
  const normalize = (text) =>
    text
      .replace(/\{\$(START|CLOSE)_[A-Z_0-9]+\}/g, '')
      .replace(/\{\$?[A-Za-z_0-9]+\}/g, '{…}')
      .replace(/\s+/g, ' ')
      .trim();
  for (const [id, row] of rows) {
    if (!(id in source)) continue;
    check(
      normalize(row.english) === normalize(source[id]),
      `glossary: ${id} English "${row.english}" differs from the catalogue "${source[id].trim()}"`,
    );
    check(
      typeof arabic[id] === 'string' && normalize(row.arabic) === normalize(arabic[id]),
      `glossary: ${id} Arabic "${row.arabic}" differs from the catalogue "${(arabic[id] ?? '').trim()}"`,
    );
  }
  // Ids that are not a status chip although their names match (none today), and rows still to be written into the glossary (G112: the
  // docs owner adds them; a stale entry here fails, so the list empties as the rows land).
  const notStatusChips = new Set([]);
  // Re-audit V: `status.inactive` (Inactive | غير نشطة) is covered once ^status\. is; the docs owner adds its row.
  const pendingGlossaryRows = new Set([]);
  for (const id of Object.keys(source).filter((key) => status.test(key))) {
    if (!rows.has(id))
      check(
        notStatusChips.has(id) || pendingGlossaryRows.has(id),
        `glossary: status ${id} has no row in docs/project/LIFECYCLE_GLOSSARY.md`,
      );
    else
      check(
        !pendingGlossaryRows.has(id),
        `glossary: ${id} now has a row; remove it from pendingGlossaryRows`,
      );
  }
  for (const id of pendingGlossaryRows)
    check(id in source, `glossary: pending row ${id} is not in the catalogue`);
}

if (failures.length) {
  console.error(`Locale verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `Locale verification passed: ${Object.keys(source).length} messages, en/ltr + ar/rtl, 3 Arabic WOFF2 weights.`,
);
