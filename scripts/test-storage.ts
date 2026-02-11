import { uploadFile, getSignedDownloadUrl, deleteFile, getFileUrl } from '../src/lib/services/storage';
import fs from 'fs/promises';
import { env } from '../src/lib/env';

async function testStorage() {
  console.log('🧪 Testing Storage Service...');
  console.log('Driver:', env.STORAGE_DRIVER);

  const testKey = 'test/hello.txt';
  const content = Buffer.from('Hello ECCB!');
  
  // 1. Upload
  await uploadFile(content, testKey, 'text/plain');
  console.log('✅ Upload success');

  // 2. Get URL
  const url = await getFileUrl(testKey);
  console.log('✅ URL generated:', url);

  // 3. Verify locally if driver is LOCAL
  if (env.STORAGE_DRIVER === 'LOCAL') {
    const exists = await fs.access(`${env.LOCAL_STORAGE_PATH}/${testKey}`).then(() => true).catch(() => false);
    if (exists) {
      console.log('✅ File verified on disk');
    } else {
      throw new Error('❌ File NOT found on disk');
    }
  }

  // 4. Delete
  await deleteFile(testKey);
  console.log('✅ Delete success');

  console.log('🎉 Storage Service Test Passed!');
}

testStorage().catch(err => {
  console.error('❌ Storage Test Failed:', err);
  process.exit(1);
});
