const fs = require('fs');
const code = fs.readFileSync('src/workers/__tests__/quality-gates.test.ts', 'utf8');

let newCode = code.replace(
`      segmentationConfidence: 55, // < 70 threshold → Gate 4 fires
      pageLabels: [],`,
`      segmentationConfidence: 55, // < 70 threshold → Gate 4 fires
      pageLabels: [
        { pageIndex: 0, label: 'Flute', confidence: 100 },
        { pageIndex: 3, label: 'Clarinet', confidence: 100 },
        { pageIndex: 1, label: 'Flute', confidence: 100 }
      ],`
);

newCode = newCode.replace(
`      segmentationConfidence: 65,
      pageLabels: [],`,
`      segmentationConfidence: 65,
      pageLabels: [
        { pageIndex: 0, label: 'Clarinet', confidence: 100 },
        { pageIndex: 1, label: 'Clarinet', confidence: 100 },
        { pageIndex: 2, label: 'Clarinet', confidence: 100 }
      ],`
);

if (newCode !== code) {
  fs.writeFileSync('src/workers/__tests__/quality-gates.test.ts', newCode);
  console.log('Patched tests successfully');
} else {
  console.log('Not patched');
}
