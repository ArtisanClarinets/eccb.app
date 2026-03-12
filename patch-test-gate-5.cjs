const fs = require('fs');
const code = fs.readFileSync('src/workers/__tests__/quality-gates.test.ts', 'utf8');

let newCode = code.replace(
`      segmentationConfidence: 65,
      pageLabels: [`,
`      segmentationConfidence: 75,
      pageLabels: [`
).replace(
`// segmentationConfidence = 65, extractionConfidence = 95 → finalConfidence = 65
    // autonomousApprovalThreshold = 80 → should block`,
`// segmentationConfidence = 75, extractionConfidence = 95 → finalConfidence = 75
    // autonomousApprovalThreshold = 80 → should block`
).replace(
`expect((finalUpdate![0] as any).data.finalConfidence).toBe(65);`,
`expect((finalUpdate![0] as any).data.finalConfidence).toBe(75);`
);

if (newCode !== code) {
  fs.writeFileSync('src/workers/__tests__/quality-gates.test.ts', newCode);
  console.log('Patched Gate 5 test successfully');
} else {
  console.log('Not patched');
}
