require('dotenv').config();
const assert = require('assert');
const storageService = require('./services/storageService');
const googleDriveStorage = require('./config/googleDrive');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING GOOGLE DRIVE STORAGE ADAPTER TESTS');
  console.log('====================================================');

  console.log('1. Checking Configuration:');
  const isConfigured = storageService.isConfigured();
  console.log(`   Configured with live Google Drive: ${isConfigured}`);
  if (!isConfigured) {
    console.log('   Notice: Running in Local Emulator mode (preserving Google Drive structure).');
  }

  const testRepoId = 'test_repo_drive_999';
  const testBranch = 'main';
  const testPath = 'src/test_drive_file.txt';
  const testContent = 'Hello Google Drive Cloud Storage! ' + new Date().toISOString();
  const testMime = 'text/plain';

  console.log('\n2. Testing uploadFile():');
  const uploadResult = await storageService.uploadFile(
    testRepoId,
    testBranch,
    testPath,
    testContent,
    testMime
  );
  console.log('   Upload success:', {
    provider: uploadResult.provider,
    key: uploadResult.key,
    size: uploadResult.size,
    contentType: uploadResult.contentType
  });
  assert(uploadResult.key.includes(testPath), 'Key must contain testPath');
  assert.strictEqual(uploadResult.size, Buffer.byteLength(testContent), 'Size must match');

  console.log('\n3. Testing getFile():');
  const retrieved = await storageService.getFile(testRepoId, testBranch, testPath);
  const retrievedText = retrieved.buffer.toString('utf8');
  console.log(`   Retrieved ${retrieved.buffer.length} bytes: "${retrievedText.substring(0, 40)}..."`);
  assert.strictEqual(retrievedText, testContent, 'Retrieved content must match uploaded content exactly');

  console.log('\n4. Testing duplicateFileToBranch():');
  const dupResult = await storageService.duplicateFileToBranch(
    testRepoId,
    testBranch,
    'feature-drive',
    testPath,
    {}
  );
  console.log('   Duplicate success:', dupResult.key);
  const dupFile = await storageService.getFile(testRepoId, 'feature-drive', testPath);
  assert.strictEqual(dupFile.buffer.toString('utf8'), testContent, 'Duplicate content must match');

  console.log('\n5. Testing deleteFile():');
  await storageService.deleteFile(testRepoId, testBranch, testPath);
  await storageService.deleteFile(testRepoId, 'feature-drive', testPath);
  console.log('   Deleted test files successfully.');

  console.log('\n====================================================');
  console.log('✅ ALL GOOGLE DRIVE STORAGE ADAPTER TESTS PASSED!');
  console.log('====================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Google Drive test failed:', err);
  process.exit(1);
});
