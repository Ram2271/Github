const assert = require('assert');

const BASE_URL = 'http://localhost:5000/api';

async function testAllFunctions() {
  console.log('====================================================');
  console.log('🧪 Testing File/Folder Rename and Complete Platform Functions');
  console.log('====================================================');

  // 1. Auth: Login developer
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'developer', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert.ok(token, 'Login succeeds');
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('  ✅ PASS: Authenticated as developer');

  // 2. Create repo for testing
  const repoName = `test-repo-ops-${Date.now()}`;
  const createRepoRes = await fetch(`${BASE_URL}/repos`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: repoName,
      description: 'Repository for verifying rename, delete, and advanced operations',
      visibility: 'public',
      initReadme: true
    })
  });
  const repoData = await createRepoRes.json();
  const repo = repoData.repository;
  assert.strictEqual(createRepoRes.status, 201);
  console.log(`  ✅ PASS: Created repository ${repo.ownerUsername}/${repo.name}`);

  // 3. Create initial file
  const createFileRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/create`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      path: 'src/math.js',
      content: 'export function add(a, b) { return a + b; }\n',
      branch: 'main',
      message: 'Add math.js'
    })
  });
  assert.strictEqual(createFileRes.status, 201);
  console.log('  ✅ PASS: Created initial file src/math.js');

  // 4. Test File Edit with Rename (The core user request)
  // Edit content AND rename file path from src/math.js -> src/calculator.js
  const editWithRenameRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/edit`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      path: 'src/calculator.js',
      oldPath: 'src/math.js',
      content: 'export function add(a, b) { return a + b; }\nexport function multiply(a, b) { return a * b; }\n',
      branch: 'main',
      message: 'Rename math.js to calculator.js and add multiply function'
    })
  });
  const editWithRenameData = await editWithRenameRes.json();
  assert.strictEqual(editWithRenameRes.status, 200, `Edit with rename failed: ${JSON.stringify(editWithRenameData)}`);
  assert.strictEqual(editWithRenameData.newPath, 'src/calculator.js');
  console.log('  ✅ PASS: File edit with rename successfully processed');

  // Verify old file no longer exists in blob
  const oldBlobRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/blob/main/src/math.js`, { headers: authHeaders });
  assert.strictEqual(oldBlobRes.status, 404, 'Old path src/math.js should return 404');

  // Verify new file exists and has updated content
  const newBlobRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/blob/main/src/calculator.js`, { headers: authHeaders });
  assert.strictEqual(newBlobRes.status, 200);
  const newBlobData = await newBlobRes.json();
  assert.ok(newBlobData.content.includes('multiply'), 'New file contains updated content');
  console.log('  ✅ PASS: Old file purged and new file created with updated content');

  // 5. Test Direct File Rename endpoint (POST /api/files/:owner/:repo/rename)
  const directRenameRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/rename`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      oldPath: 'src/calculator.js',
      newPath: 'src/math-operations.js',
      branch: 'main',
      message: 'Direct rename to math-operations.js'
    })
  });
  const directRenameData = await directRenameRes.json();
  assert.strictEqual(directRenameRes.status, 200);
  assert.strictEqual(directRenameData.newPath, 'src/math-operations.js');
  console.log('  ✅ PASS: Direct file rename endpoint succeeded');

  // Verify direct rename blob
  const directBlobRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/blob/main/src/math-operations.js`, { headers: authHeaders });
  assert.strictEqual(directBlobRes.status, 200);
  console.log('  ✅ PASS: Renamed file accessible via blob endpoint');

  // 6. Test Folder Creation & Direct Folder Rename
  // Create multiple files inside a folder: src/components/Button.js and src/components/Card.js
  await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/create`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      path: 'src/components/Button.js',
      content: 'export default "Button";',
      branch: 'main',
      message: 'Add Button.js'
    })
  });
  await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/create`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      path: 'src/components/Card.js',
      content: 'export default "Card";',
      branch: 'main',
      message: 'Add Card.js'
    })
  });
  console.log('  ✅ PASS: Created files in folder src/components/');

  // Rename folder src/components -> src/elements
  const folderRenameRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/rename`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      oldPath: 'src/components',
      newPath: 'src/elements',
      branch: 'main',
      message: 'Rename folder components to elements'
    })
  });
  const folderRenameData = await folderRenameRes.json();
  assert.strictEqual(folderRenameRes.status, 200, `Folder rename failed: ${JSON.stringify(folderRenameData)}`);
  console.log('  ✅ PASS: Folder rename endpoint successfully executed');

  // Verify old folder files do not exist and new folder files do exist
  const oldBtnRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/blob/main/src/components/Button.js`, { headers: authHeaders });
  assert.strictEqual(oldBtnRes.status, 404, 'Old Button.js in components should be 404');

  const newBtnRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/blob/main/src/elements/Button.js`, { headers: authHeaders });
  assert.strictEqual(newBtnRes.status, 200, 'New Button.js in elements should be 200');

  const newCardRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/blob/main/src/elements/Card.js`, { headers: authHeaders });
  assert.strictEqual(newCardRes.status, 200, 'New Card.js in elements should be 200');
  console.log('  ✅ PASS: All files in folder migrated to new folder path');

  // 7. Test Recursive Folder Deletion
  const deleteFolderRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/delete`, {
    method: 'DELETE',
    headers: authHeaders,
    body: JSON.stringify({
      path: 'src/elements',
      branch: 'main',
      message: 'Delete elements folder'
    })
  });
  assert.strictEqual(deleteFolderRes.status, 200);

  const deletedBtnRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/blob/main/src/elements/Button.js`, { headers: authHeaders });
  assert.strictEqual(deletedBtnRes.status, 404, 'Deleted folder files should return 404');
  console.log('  ✅ PASS: Recursive folder deletion verified');

  // 8. Test Branch Creation & Deletion
  const newBranchName = 'feature/test-delete-branch';
  const createBranchRes = await fetch(`${BASE_URL}/repos/${repo.ownerUsername}/${repo.name}/branches`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: newBranchName, sourceBranch: 'main' })
  });
  assert.strictEqual(createBranchRes.status, 201);
  console.log(`  ✅ PASS: Created branch ${newBranchName}`);

  // Delete branch
  const deleteBranchRes = await fetch(`${BASE_URL}/repos/${repo.ownerUsername}/${repo.name}/branches/${encodeURIComponent(newBranchName)}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  assert.strictEqual(deleteBranchRes.status, 200);
  console.log(`  ✅ PASS: Successfully deleted branch ${newBranchName}`);

  // 9. Verify Commit History reflects all operations
  const commitListRes = await fetch(`${BASE_URL}/repos/${repo.ownerUsername}/${repo.name}/commits/main`, { headers: authHeaders });
  const commitListData = await commitListRes.json();
  assert.ok(commitListData.commits.length >= 4, 'Commits recorded for all file and folder operations');
  console.log(`  ✅ PASS: Commit log contains ${commitListData.commits.length} commits tracking full history`);

  console.log('====================================================');
  console.log('🎉 ALL RENAME, FOLDER, AND PLATFORM OPERATIONS VERIFIED SUCCESSFULLY!');
  console.log('====================================================');
}

testAllFunctions().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
