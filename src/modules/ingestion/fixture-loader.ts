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
}

const FIXTURE_PROVIDERS: Array<Exclude<CloudProvider, 'gateway'>> = ['aws', 'gcp', 'azure'];
const FIXTURE_NAME_RE = /^[A-Za-z0-9_-]+$/;

export function listFixtures(): FixtureDescriptor[] {
  const root = resolveFixturesRoot();
  const descriptors: FixtureDescriptor[] = [];

  for (const provider of FIXTURE_PROVIDERS) {
    const providerDir = join(root, provider);
    if (!existsSync(providerDir)) continue;
    for (const fileName of readdirSync(providerDir)) {
      if (!fileName.endsWith('.json')) continue;
      descriptors.push({
        id: `${provider}/${fileName.replace(/\.json$/, '')}`,
        provider,
        fileName,
      });
    }
  }

  return descriptors.sort((a, b) => a.id.localeCompare(b.id));
}

export function loadFixture(id: string): { provider: Exclude<CloudProvider, 'gateway'>; payload: unknown } {
  const parts = id.split('/');
  if (parts.length !== 2) {
    throw new Error(`Unknown fixture id: ${id}`);
  }

  const [provider, name] = parts;
  if (
    !provider ||
    !name ||
    !FIXTURE_PROVIDERS.includes(provider as Exclude<CloudProvider, 'gateway'>) ||
    !FIXTURE_NAME_RE.test(name)
  ) {
    throw new Error(`Unknown fixture id: ${id}`);
  }

  const root = resolveFixturesRoot();
  const providerRoot = resolve(root, provider);
  const filePath = resolve(providerRoot, `${name}.json`);
  if (!(filePath === providerRoot || filePath.startsWith(`${providerRoot}${sep}`))) {
    throw new Error(`Unknown fixture id: ${id}`);
  }
  if (!existsSync(filePath)) {
    throw new Error(`Fixture not found: ${id}`);
  }

  // Some fixture files carry a UTF-8 BOM (saved on Windows); strip it before parsing.
  const BOM = String.fromCharCode(0xfeff);
  const raw = readFileSync(filePath, 'utf8').replace(new RegExp(`^${BOM}`), '');
  const payload = JSON.parse(raw);
  return { provider: provider as Exclude<CloudProvider, 'gateway'>, payload };
}
