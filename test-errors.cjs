const fs = require('fs');

const files = [
  'src/app/(admin)/admin/members/__tests__/actions.test.ts',
  'src/app/(admin)/admin/settings/__tests__/actions.test.ts',
  'src/lib/llm/__tests__/index.test.ts'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  if (!code.includes("vi.spyOn(console, 'error').mockImplementation(() => {});")) {
    const describeRegex = /describe\(['"].*?['"],\s*\(\)\s*=>\s*\{/;

    code = code.replace(describeRegex, (match) => {
      return match + "\n  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });\n  afterEach(() => { vi.restoreAllMocks(); });";
    });

    // ensure afterEach is imported
    if (code.includes('import {') && !code.includes('afterEach')) {
      code = code.replace('import {', 'import { afterEach,');
    }

    fs.writeFileSync(file, code);
  }
}
console.log('patched test files to silence console.error');
