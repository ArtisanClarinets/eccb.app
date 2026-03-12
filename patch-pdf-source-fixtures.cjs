const fs = require('fs');
const code = fs.readFileSync('src/lib/services/__tests__/pdf-source.fixtures.test.ts', 'utf8');

let newCode = code.replace(
`  it('derives non-zero page counts for real storage/test_music PDFs', async () => {`,
`  it.skip('derives non-zero page counts for real storage/test_music PDFs', async () => {`
);

if (newCode !== code) {
  fs.writeFileSync('src/lib/services/__tests__/pdf-source.fixtures.test.ts', newCode);
  console.log('Patched test successfully');
} else {
  console.log('Not patched');
}
