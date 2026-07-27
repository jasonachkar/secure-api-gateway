#!/usr/bin/env node
/**
 * CI gate: fails if any emoji code points are found in dashboard/src.
 * package.json referenced this script (npm run check:ui-copy) before it existed -
 * this is the missing implementation.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const TARGET_DIR = join(process.cwd(), 'dashboard', 'src');
const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.md']);

// Matches emoji pictograph/symbol/dingbat/flag ranges plus the emoji variation
// selector (U+FE0F), without needing an external unicode-emoji dependency.
// Deliberately excludes:
//  - the arrow block (U+2190-21FF): plain directional arrows are UI affordances, not emoji.
//  - bare check/cross marks U+2713 (✓) and U+2717 (✗): plain typographic bullet/status
//    glyphs in wide professional use, distinct from their colorful emoji counterparts
//    (U+2705 ✅, U+274C ❌) which remain flagged.
const EMOJI_PATTERN =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2712}\u{2714}-\u{2716}\u{2718}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/gu;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
    } else if (SCANNABLE_EXTENSIONS.has(fullPath.slice(fullPath.lastIndexOf('.')))) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  let violations = [];
  let files;
  try {
    files = walk(TARGET_DIR);
  } catch (error) {
    console.error(`check-ui-copy: could not read ${TARGET_DIR}: ${error.message}`);
    process.exit(1);
  }

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const matches = line.match(EMOJI_PATTERN);
      if (matches) {
        violations.push({
          file: relative(process.cwd(), file),
          line: index + 1,
          matches: [...new Set(matches)].join(' '),
        });
      }
    });
  }

  if (violations.length > 0) {
    console.error(`check-ui-copy: found ${violations.length} emoji occurrence(s) in dashboard/src:\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.matches}`);
    }
    console.error('\nReplace emoji with lucide-react icons or restrained text labels.');
    process.exit(1);
  }

  console.log(`check-ui-copy: no emoji found across ${files.length} file(s) in dashboard/src.`);
}

main();
