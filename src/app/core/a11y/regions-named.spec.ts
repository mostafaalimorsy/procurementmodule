/**
 * CF-104 AC3 (B-104-2): every `role="region"` in a template has an accessible name, so a screen reader's region list never offers an
 * unnamed "region". The scan reads the template sources (`*.html` and inline `template:` strings in `*.ts`), so a new unnamed region fails
 * here before it reaches a page.
 */

interface NodeFs {
  existsSync(path: string): boolean;
  readdirSync(path: string, options: { withFileTypes: true }): NodeDirent[];
  readFileSync(path: string, encoding: 'utf8'): string;
}
interface NodeDirent {
  readonly name: string;
  isDirectory(): boolean;
}

/** Node's fs, loaded at run time (the spec bundle is typed for the browser; the runner is Node). */
async function nodeFs(): Promise<NodeFs> {
  const load = (name: string) => import(/* @vite-ignore */ name) as Promise<NodeFs>;
  return load(['node', 'fs'].join(':'));
}

function appRoot(fs: NodeFs): string {
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
  for (const candidate of [`${cwd}/src/app`, `${cwd}/frontend/src/app`])
    if (fs.existsSync(candidate)) return candidate;
  throw new Error(`Cannot find src/app from ${cwd}`);
}

function templateFiles(fs: NodeFs, directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return templateFiles(fs, path);
    if (entry.name.endsWith('.spec.ts')) return [];
    return entry.name.endsWith('.html') || entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** The whole opening tag around `index`, honouring quoted attribute values (a binding may contain `>`). */
function openingTag(source: string, index: number): string {
  let start = index;
  while (start > 0 && !(source[start] === '<' && /[a-zA-Z]/.test(source[start + 1] ?? ''))) start--;
  let quote: string | null = null;
  for (let end = start + 1; end < source.length; end++) {
    const character = source[end];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return source.slice(start, end + 1);
  }
  return source.slice(start);
}

const NAMED =
  /(?:^|\s)(?:aria-label|aria-labelledby|\[attr\.aria-label\]|\[attr\.aria-labelledby\])\s*=/;

interface Region {
  readonly file: string;
  readonly line: number;
  readonly tag: string;
  readonly source: string;
}

async function regions(): Promise<Region[]> {
  const fs = await nodeFs();
  const root = appRoot(fs);
  const found: Region[] = [];
  for (const file of templateFiles(fs, root)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\brole\s*=\s*["']region["']/g)) {
      const index = match.index ?? 0;
      found.push({
        file: file.slice(root.length + 1),
        line: source.slice(0, index).split('\n').length,
        tag: openingTag(source, index).replace(/\s+/g, ' '),
        source,
      });
    }
  }
  return found;
}

describe('Named regions (CF-104)', () => {
  it('gives every role="region" an accessible name', async () => {
    const all = await regions();
    // The scan must find the regions it is about (13 when the criterion was written), so it cannot pass by matching nothing.
    expect(all.length).toBeGreaterThanOrEqual(13);
    const unnamed = all
      .filter((region) => !NAMED.test(region.tag))
      .map((region) => `${region.file}:${region.line} ${region.tag}`);
    expect(unnamed).toEqual([]);
  });

  it('points every literal aria-labelledby of a region at an element of the same template', async () => {
    const dangling: string[] = [];
    for (const region of await regions()) {
      const literal = /(?:^|\s)aria-labelledby\s*=\s*"([^"]+)"/.exec(region.tag);
      if (!literal) continue;
      for (const id of literal[1].trim().split(/\s+/))
        if (!new RegExp(`\\bid\\s*=\\s*["']${id}["']`).test(region.source))
          dangling.push(`${region.file}:${region.line} → #${id}`);
    }
    expect(dangling).toEqual([]);
  });
});
