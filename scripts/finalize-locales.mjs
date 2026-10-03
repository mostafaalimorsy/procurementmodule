import { readFile, writeFile } from 'node:fs/promises';
// Angular sets lang/base href. Set direction before first paint, consistent with LocaleService.
for (const [locale, direction] of [
  ['en', 'ltr'],
  ['ar', 'rtl'],
]) {
  const path = new URL(
    `../dist/subcontractor-intelligence/browser/${locale}/index.html`,
    import.meta.url,
  );
  const html = await readFile(path, 'utf8');
  await writeFile(path, html.replace(/dir="ltr"/, `dir="${direction}"`));
}
