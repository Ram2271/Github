const assert = require('assert');

const BASE_URL = 'http://localhost:5000/api';

async function testFolderUpload() {
  console.log('Testing Folder Upload with directory preservation via native fetch/FormData...');

  // 1. Log in as developer
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'developer', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Create a repo for folder upload test
  const repoName = `folder-test-${Date.now()}`;
  const repoRes = await fetch(`${BASE_URL}/repos`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: repoName,
      description: 'Testing folder hierarchy upload',
      visibility: 'public',
      initReadme: true
    })
  });
  const repoData = await repoRes.json();
  const repo = repoData.repository;
  console.log(`Created repo: ${repo.fullName}`);

  // 3. Prepare FormData with nested files
  const form = new FormData();
  form.append('message', 'Upload nested app package');
  
  const filesToUpload = [
    { path: 'package.json', content: JSON.stringify({ name: 'nested-app', version: '1.0.0' }, null, 2), mime: 'application/json' },
    { path: 'src/index.js', content: 'console.log("Hello from nested app");', mime: 'text/javascript' },
    { path: 'src/components/Header.jsx', content: 'export default function Header() { return <h1>Header</h1>; }', mime: 'text/javascript' },
    { path: 'src/components/Button.jsx', content: 'export default function Button() { return <button>Click</button>; }', mime: 'text/javascript' },
    { path: 'src/styles/main.css', content: 'body { margin: 0; background: #0d1117; }', mime: 'text/css' }
  ];

  const pathsArray = [];
  for (const f of filesToUpload) {
    const blob = new Blob([f.content], { type: f.mime });
    form.append('files', blob, f.path.split('/').pop());
    pathsArray.push(f.path);
  }
  form.append('paths', JSON.stringify(pathsArray));

  console.log(`Repository created: ${repo.ownerUsername}/${repo.name}`);

  const uploadRes = await fetch(
    `${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/upload/main`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    }
  );

  console.log('Upload status:', uploadRes.status);
  const rawUploadText = await uploadRes.text();
  console.log('Upload response text:', rawUploadText.substring(0, 500));
  const uploadData = JSON.parse(rawUploadText);
  assert.strictEqual(uploadRes.status, 200, `Upload failed: ${JSON.stringify(uploadData)}`);
  assert.strictEqual(uploadData.filesUploaded, 5);
  console.log('✅ Uploaded 5 files with nested directory paths');

  // 4. Test tree root
  const rootTreeRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/tree/main/`, { headers: authHeaders });
  const rootTreeData = await rootTreeRes.json();
  const rootItems = rootTreeData.items;
  const rootDirs = rootItems.filter(i => i.type === 'directory').map(i => i.name);
  const rootFiles = rootItems.filter(i => i.type === 'file').map(i => i.name);
  
  console.log('Root directory items:', { rootDirs, rootFiles });
  assert.ok(rootDirs.includes('src'), 'Root should contain "src" directory');
  assert.ok(rootFiles.includes('package.json'), 'Root should contain "package.json" file');
  assert.ok(rootFiles.includes('README.md'), 'Root should contain "README.md"');

  // 5. Test navigating into 'src'
  const srcTreeRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/tree/main/src`, { headers: authHeaders });
  const srcTreeData = await srcTreeRes.json();
  const srcItems = srcTreeData.items;
  const srcDirs = srcItems.filter(i => i.type === 'directory').map(i => i.name);
  const srcFiles = srcItems.filter(i => i.type === 'file').map(i => i.name);

  console.log('src/ directory items:', { srcDirs, srcFiles });
  assert.ok(srcDirs.includes('components'), 'src should contain "components" directory');
  assert.ok(srcDirs.includes('styles'), 'src should contain "styles" directory');
  assert.ok(srcFiles.includes('index.js'), 'src should contain "index.js" file');

  // 6. Test navigating into 'src/components'
  const compTreeRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/tree/main/src/components`, { headers: authHeaders });
  const compTreeData = await compTreeRes.json();
  const compItems = compTreeData.items;
  const compFiles = compItems.filter(i => i.type === 'file').map(i => i.name);

  console.log('src/components/ directory items:', compFiles);
  assert.ok(compFiles.includes('Header.jsx'), 'components should contain "Header.jsx"');
  assert.ok(compFiles.includes('Button.jsx'), 'components should contain "Button.jsx"');

  // 7. Test fetching blob for nested file
  const blobRes = await fetch(`${BASE_URL}/files/${repo.ownerUsername}/${repo.name}/blob/main/src/components/Button.jsx`, { headers: authHeaders });
  const blobData = await blobRes.json();
  assert.ok(blobData.content.includes('<button>Click</button>'), 'Blob content matches');
  console.log('✅ Blob retrieval for nested file succeeded');

  console.log('🎉 ALL FOLDER UPLOAD AND DIRECTORY HIERARCHY TESTS PASSED!');
}

testFolderUpload().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
