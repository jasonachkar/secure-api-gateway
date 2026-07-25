#!/usr/bin/env node
/**
 * Copies test/fixtures into dist/fixtures so the guided-scenario replay engine
 * has real fixture data available at runtime in the built/deployed image
 * (the Docker image only ships dist/, not test/).
 */
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'test', 'fixtures');
const DEST = join(process.cwd(), 'dist', 'fixtures');

if (!existsSync(SRC)) {
  console.error(`copy-fixtures: source directory not found: ${SRC}`);
  process.exit(1);
}

cpSync(SRC, DEST, { recursive: true });
console.log(`copy-fixtures: copied ${SRC} -> ${DEST}`);
