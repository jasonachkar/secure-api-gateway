/**
 * Loads sanitized replay fixtures (guided scenarios, replay endpoints).
 *
 * In the built/deployed image, fixtures live at dist/fixtures (copied from
 * test/fixtures by scripts/copy-fixtures.mjs as part of `npm run build`,
 * see Dockerfile). In local dev (tsx running directly against src/), that
 * copy step hasn't run, so this falls back to reading test/fixtures directly.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { CloudProvider } from '../security/types.js';

// This project compiles to CommonJS (see tsconfig "module": "NodeNext" with no
// "type": "module" in package.json), so __dirname is available natively -
// no import.meta/fileURLToPath needed.
function resolveFixturesRoot(): string {
  const builtLayout = join(__dirname, '..', '..', 'fixtures'); // dist/modules/ingestion -> dist/fixtures
  if (existsSync(builtLayout)) return builtLayout;

  const devLayout = join(__dirname, '..', '..', '..', 'test', 'fixtures'); // src/modules/ingestion -> test/fixtures
  if (existsSync(devLayout)) return devLayout;

  throw new Error(
    `Fixture directory not found. Checked: ${builtLayout}, ${devLayout}. ` +
      'Run `npm run build` (copies test/fixtures -> dist/fixtures) or run from a repo checkout with test/fixtures present.'
  );
}

export interface FixtureDescriptor {
  id: string;
  provider: Exclude<CloudProvider, 'gateway'>;
  fileName: string;
  /** Absolute, filesystem-resolved path - computed once when the catalogue is built, never from request input. */
  absolutePath: string;
}

const FIXTURE_PROVIDERS: Array<Exclude<CloudProvider, 'gateway'>> = ['aws', 'gcp', 'azure'];
// Only used when walking the known fixture directories to build the catalogue below -
// never applied to request-supplied strings. Deliberately strict (no dots, no path
// separators) so a malformed file on disk can't produce a surprising id either.
const FIXTURE_NAME_RE = /^[A-Za-z0-9_-]+$/;

let catalogueCache: Map<string, FixtureDescriptor> | undefined;

/**
 * Build the exact fixture catalogue by walking the approved provider directories once.
 * This is the only place that ever turns a filesystem listing into fixture ids/paths -
 * everywhere else resolves a request-supplied id by exact lookup against this map, never
 * by reconstructing a path from the id itself. Cached for the process lifetime since the
 * fixture set is static (built into the image / checked into the repo, not runtime data).
 */
function buildCatalogue(): Map<string, FixtureDescriptor> {
  if (catalogueCache) return catalogueCache;

  const root = resolveFixturesRoot();
  const catalogue = new Map<string, FixtureDescriptor>();

  for (const provider of FIXTURE_PROVIDERS) {
    const providerDir = resolve(root, provider);
    if (!existsSync(providerDir)) continue;

    for (const fileName of readdirSync(providerDir)) {
      // Reject anything that isn't a plain "<safe-name>.json" basename - unknown
      // extensions, dotfiles, and nested paths (readdirSync doesn't recurse, but a
      // crafted symlink could still produce a surprising entry) never enter the catalogue.
      if (!fileName.endsWith('.json')) continue;
      const name = fileName.slice(0, -'.json'.length);
      if (!FIXTURE_NAME_RE.test(name)) continue;

      // readdirSync entries are always direct-child basenames (never containing a path
      // separator), so this can't escape providerDir - the startsWith check is a final
      // confirmation before the path ever reaches the catalogue.
      const absolutePath = resolve(providerDir, fileName);
      if (!absolutePath.startsWith(`${providerDir}${sep}`)) continue;

      const id = `${provider}/${name}`;
      catalogue.set(id, { id, provider, fileName, absolutePath });
    }
  }

  catalogueCache = catalogue;
  return catalogue;
}

export function listFixtures(): FixtureDescriptor[] {
  return [...buildCatalogue().values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function loadFixture(id: string): { provider: Exclude<CloudProvider, 'gateway'>; payload: unknown } {
  // Exact allowlist lookup against the pre-built catalogue - the request-supplied id is
  // never used to construct a filesystem path. Any id not already present in the
  // catalogue (`..`, extra separators, encoded traversal, absolute paths, unknown
  // providers/extensions, nested filenames, ids that simply don't exist) is rejected
  // uniformly as "unknown fixture id".
  const descriptor = typeof id === 'string' ? buildCatalogue().get(id) : undefined;
  if (!descriptor) {
    throw new Error(`Unknown fixture id: ${id}`);
  }

  // Some fixture files carry a UTF-8 BOM (saved on Windows); strip it before parsing.
  const BOM = String.fromCharCode(0xfeff);
  const raw = readFileSync(descriptor.absolutePath, 'utf8').replace(new RegExp(`^${BOM}`), '');
  const payload = JSON.parse(raw);
  return { provider: descriptor.provider, payload };
}
