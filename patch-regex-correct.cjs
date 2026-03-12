const fs = require('fs');
const file = 'src/app/(admin)/admin/uploads/review/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Remove the badly formatted disable comment if any
code = code.replace("  // eslint-disable-next-line no-control-regex\\n'use client';", "'use client';");

const targetLine = "  let cleaned = value.replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g, '');";
if (code.includes(targetLine)) {
  const newCode = code.replace(
    "  let cleaned = value.replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g, '');",
    "  // eslint-disable-next-line no-control-regex\n  let cleaned = value.replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g, '');"
  );
  fs.writeFileSync(file, newCode);
  console.log('Patched regex');
}
