import { promises as fs } from 'fs';
import path from 'path';

// __dirname isn't available in ESM; derive from import.meta.url
const ROOT = path.dirname(new URL('..', import.meta.url).pathname);
const SKIP_PATTERNS = [/\bdescribe\.skip\b/, /\bit\.skip\b/, /\btest\.skip\b/, /\.skip\(/, /\.todo\(/];
const FILE_GLOBS = ['src', 'scripts'];

async function scanDir(dir: string, results: Array<{file: string; line: number; match: string}>) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(full, results);
    } else if (/\.tsx?$/.test(entry.name) || /\.ts$/.test(entry.name) || /\.jsx?$/.test(entry.name)) {
      const content = await fs.readFile(full, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        for (const pat of SKIP_PATTERNS) {
          if (pat.test(lines[i])) {
            results.push({ file: full, line: i + 1, match: lines[i].trim() });
          }
        }
      }
    }
  }
}

async function main() {
  console.log('🔍 Checking for skipped/todo tests...');
  const issues: Array<{file: string; line: number; match: string}> = [];
  for (const g of FILE_GLOBS) {
    const dir = path.join(ROOT, g);
    try {
      await scanDir(dir, issues);
    } catch {
      // ignore missing directories
    }
  }
  if (issues.length > 0) {
    console.error('✗ Found skipped/todo patterns:');
    for (const it of issues) {
      console.error(`  ${it.file}:${it.line} -> ${it.match}`);
    }
    process.exit(1);
  } else {
    console.log('✓ No skipped or todo tests detected.');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Error running skip-guard:', e);
  process.exit(1);
});
