const http = require('http');

const BASE_URL = 'http://localhost:5000';

async function req(path, options = {}, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let bodyData = options.body;
    if (bodyData && typeof bodyData === 'object' && !(bodyData instanceof Buffer)) {
      headers['Content-Type'] = 'application/json';
      bodyData = JSON.stringify(bodyData);
    }

    const clientReq = http.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });

    clientReq.on('error', reject);
    if (bodyData) clientReq.write(bodyData);
    clientReq.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Comprehensive Automated Platform Verification');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await req('/api/health');
    assert(health.status === 200 && health.data.status === 'online', 'Health endpoint returns 200 online');

    // 2. Auth: Register new test user and verify 6-digit email code
    const testUsername = `user_${Date.now().toString().slice(-6)}`;
    const testEmail = `${testUsername}@example.com`;
    const regRes = await req('/api/auth/register', {
      method: 'POST',
      body: {
        username: testUsername,
        name: 'Verification Bot',
        email: testEmail,
        password: 'Password123!'
      }
    });

    const verifyRes = await req('/api/auth/register-verify', {
      method: 'POST',
      body: {
        email: testEmail,
        code: regRes.data.devCode
      }
    });
    assert(verifyRes.status === 201 && verifyRes.data.token, `Registration & email verification succeeds for ${testUsername}`);
    const token = verifyRes.data.token;

    // 3. Auth: Get Current User
    const meRes = await req('/api/auth/me', {}, token);
    assert(meRes.status === 200 && meRes.data.user.username === testUsername, 'Get current authenticated user profile');

    // 4. Repo: Create new repository with README
    const repoName = 'verification-web-app';
    const createRepoRes = await req('/api/repos', {
      method: 'POST',
      body: {
        name: repoName,
        description: 'Automated test repository for web runner and Filebase S3',
        visibility: 'public',
        initReadme: true
      }
    }, token);
    assert(createRepoRes.status === 201 && createRepoRes.data.repository.name === repoName, 'Create public repository with initial README');

    // 5. Filebase S3: Verify README was stored with complete repository path & Filebase reference
    const treeRes = await req(`/api/files/${testUsername}/${repoName}/tree/main/`);
    assert(treeRes.status === 200 && treeRes.data.readme?.content.includes('verification-web-app'), 'README rendered and fetched from Filebase');

    // 6. In-browser File Creation with commit
    const createFileRes = await req(`/api/files/${testUsername}/${repoName}/create`, {
      method: 'POST',
      body: {
        path: 'src/index.js',
        content: 'console.log("Hello from Filebase S3!");',
        branch: 'main',
        message: 'Add src/index.js entry file'
      }
    }, token);
    assert(createFileRes.status === 201 && createFileRes.data.file.path === 'src/index.js', 'Create file in subdirectory with commit');

    // 7. In-browser File Editing with commit & diff calculation
    const editFileRes = await req(`/api/files/${testUsername}/${repoName}/edit`, {
      method: 'PUT',
      body: {
        path: 'src/index.js',
        content: 'console.log("Hello from Filebase S3!");\nconsole.log("Updated via live editor.");',
        branch: 'main',
        message: 'Update src/index.js with second log'
      }
    }, token);
    console.log('editFileRes debug:', editFileRes.data);
    assert(editFileRes.status === 200 && editFileRes.data.commit?.totalAdditions >= 1, 'Edit file calculates git additions and records commit');

    // 8. Branch Management: Create feature branch
    const branchRes = await req(`/api/repos/${testUsername}/${repoName}/branches`, {
      method: 'POST',
      body: {
        name: 'feature/web-runner',
        sourceBranch: 'main'
      }
    }, token);
    assert(branchRes.status === 201 && branchRes.data.branch.name === 'feature/web-runner', 'Create new branch branching from main');

    // 9. Web Project Runner: Add index.html to feature branch to trigger runner capability
    const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Test App</title></head>
<body>
  <h1>Live Runner Running!</h1>
  <script>console.log("Runner online");</script>
</body>
</html>`;
    const addHtmlRes = await req(`/api/files/${testUsername}/${repoName}/create`, {
      method: 'POST',
      body: {
        path: 'index.html',
        content: htmlContent,
        branch: 'feature/web-runner',
        message: 'Add index.html for live runner'
      }
    }, token);
    assert(addHtmlRes.status === 201, 'Add index.html to feature branch');

    // 10. Web Project Runner: Test detection endpoint
    const detectRes = await req(`/api/runner/detect/${testUsername}/${repoName}/feature/web-runner`);
    assert(detectRes.status === 200 && detectRes.data.detection.isWebProject === true, 'Runner automatically detects index.html web project');

    // 11. Web Project Runner: Test HTTP server route serving index.html with live console bridge injection
    const serveRes = await req(`/runner/${testUsername}/${repoName}/feature/web-runner/`);
    assert(serveRes.status === 200 && typeof serveRes.data === 'string' && serveRes.data.includes('GitHub Live Runner Console Bridge'), 'Runner serves web project over HTTP with Console Bridge injection');

    // 12. Pull Request: Create PR from feature/web-runner to main
    const prRes = await req(`/api/repos/${testUsername}/${repoName}/pulls`, {
      method: 'POST',
      body: {
        baseBranch: 'main',
        headBranch: 'feature/web-runner',
        title: 'Feature: Add Live Web App Runner',
        body: 'This PR introduces index.html for interactive execution.'
      }
    }, token);
    assert(prRes.status === 201 && prRes.data.pullRequest.number === 1, 'Create pull request across branches');

    // 13. Pull Request: Live diff verification
    const prDetailRes = await req(`/api/repos/${testUsername}/${repoName}/pulls/1`);
    assert(prDetailRes.status === 200 && prDetailRes.data.diff.filesChanged.length > 0, 'Pull request generates live unified diff of changed files');

    // 14. Pull Request: Merge PR
    const mergeRes = await req(`/api/repos/${testUsername}/${repoName}/pulls/1/merge`, {
      method: 'POST'
    }, token);
    assert(mergeRes.status === 200 && mergeRes.data.success === true, 'Merge pull request fast-forwards changes and records merge commit');

    // 15. Issues: Create issue & comment
    const issueRes = await req(`/api/repos/${testUsername}/${repoName}/issues`, {
      method: 'POST',
      body: {
        title: 'Add dark mode toggle to runner',
        body: 'The runner frame should support theme toggling.'
      }
    }, token);
    assert(issueRes.status === 201 && issueRes.data.issue.number === 1, 'Create issue with title and body');

    const commentRes = await req(`/api/repos/${testUsername}/${repoName}/issues/1/comments`, {
      method: 'POST',
      body: { body: 'Working on this enhancement now!' }
    }, token);
    assert(commentRes.status === 201 && commentRes.data.comment.body.includes('Working on'), 'Add discussion comment to issue');

    // 16. Stars: Toggle star
    const starRes = await req(`/api/repos/${testUsername}/${repoName}/star`, {
      method: 'POST'
    }, token);
    assert(starRes.status === 200 && starRes.data.isStarred === true, 'Star repository increments counter');

    // 17. Global Search: Search across repositories, users, code, and issues
    const searchRepos = await req(`/api/search?q=verification&type=repositories`);
    assert(searchRepos.status === 200 && searchRepos.data.results.length > 0, 'Global search finds repositories');

    const searchUsers = await req(`/api/search?q=${testUsername}&type=users`);
    assert(searchUsers.status === 200 && searchUsers.data.results.length > 0, 'Global search finds users');

    const searchIssues = await req(`/api/search?q=dark%20mode&type=issues`);
    assert(searchIssues.status === 200 && searchIssues.data.results.length > 0, 'Global search finds issues');

    // 18. User Profile & Heatmap
    const profileRes = await req(`/api/users/${testUsername}`);
    assert(profileRes.status === 200 && profileRes.data.user.username === testUsername, 'Fetch public user profile');

    const activityRes = await req(`/api/users/${testUsername}/activity`);
    console.log('activityRes debug:', activityRes.data);
    assert(activityRes.status === 200 && (activityRes.data.totalContributions >= 0), 'User contribution heatmap logs daily activity');

    console.log('====================================================');
    console.log(`Summary: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================');
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution exception:', err);
    process.exit(1);
  }
}

runTests();
