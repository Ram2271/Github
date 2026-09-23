const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('gh_token');
  const headers = {
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is FormData, do not set Content-Type header (browser sets boundary)
  if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorMsg = data && data.error ? data.error : (typeof data === 'string' ? data : 'Request failed');
    throw new Error(errorMsg);
  }

  return data;
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body }),
  registerVerify: (body) => request('/auth/register-verify', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  loginVerify: (body) => request('/auth/login-verify', { method: 'POST', body }),
  resendCode: (body) => request('/auth/resend-code', { method: 'POST', body }),
  getMe: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/profile', { method: 'PUT', body }),

  // Users
  getUser: (username) => request(`/users/${username}`),
  toggleFollow: (username) => request(`/users/${username}/follow`, { method: 'POST' }),
  getUserRepos: (username) => request(`/users/${username}/repos`),
  getUserStarred: (username) => request(`/users/${username}/starred`),
  getUserActivity: (username) => request(`/users/${username}/activity`),

  // Repositories
  listRepos: () => request('/repos'),
  createRepo: (body) => request('/repos', { method: 'POST', body }),
  getRepo: (owner, repo) => request(`/repos/${owner}/${repo}`),
  updateRepo: (owner, repo, body) => request(`/repos/${owner}/${repo}`, { method: 'PUT', body }),
  deleteRepo: (owner, repo) => request(`/repos/${owner}/${repo}`, { method: 'DELETE' }),
  toggleStar: (owner, repo) => request(`/repos/${owner}/${repo}/star`, { method: 'POST' }),
  forkRepo: (owner, repo) => request(`/repos/${owner}/${repo}/fork`, { method: 'POST' }),

  // Files & Google Drive Cloud Storage
  getTree: (owner, repo, branch, path = '') => request(`/files/${owner}/${repo}/tree/${branch}/${path}`),
  getBlob: (owner, repo, branch, path) => request(`/files/${owner}/${repo}/blob/${branch}/${path}`),
  uploadFiles: (owner, repo, formData) => request(`/files/${owner}/${repo}/upload`, { method: 'POST', body: formData }),
  createFile: (owner, repo, body) => request(`/files/${owner}/${repo}/create`, { method: 'POST', body }),
  editFile: (owner, repo, body) => request(`/files/${owner}/${repo}/edit`, { method: 'PUT', body }),
  renameFile: (owner, repo, body) => request(`/files/${owner}/${repo}/rename`, { method: 'POST', body }),
  deleteFile: (owner, repo, body) => request(`/files/${owner}/${repo}/delete`, { method: 'DELETE', body }),

  // Branches
  listBranches: (owner, repo) => request(`/repos/${owner}/${repo}/branches`),
  createBranch: (owner, repo, body) => request(`/repos/${owner}/${repo}/branches`, { method: 'POST', body }),
  deleteBranch: (owner, repo, branchName) => request(`/repos/${owner}/${repo}/branches/${branchName}`, { method: 'DELETE' }),

  // Commits
  listCommits: (owner, repo, branch) => request(`/repos/${owner}/${repo}/commits/${branch}`),
  getCommit: (owner, repo, sha) => request(`/repos/${owner}/${repo}/commits/detail/${sha}`),

  // Issues
  listIssues: (owner, repo, state = 'open') => request(`/repos/${owner}/${repo}/issues?state=${state}`),
  createIssue: (owner, repo, body) => request(`/repos/${owner}/${repo}/issues`, { method: 'POST', body }),
  getIssue: (owner, repo, number) => request(`/repos/${owner}/${repo}/issues/${number}`),
  addIssueComment: (owner, repo, number, body) => request(`/repos/${owner}/${repo}/issues/${number}/comments`, { method: 'POST', body }),
  toggleIssueState: (owner, repo, number, state) => request(`/repos/${owner}/${repo}/issues/${number}/state`, { method: 'PATCH', body: { state } }),

  // Pull Requests
  listPRs: (owner, repo, state = 'open') => request(`/repos/${owner}/${repo}/pulls?state=${state}`),
  createPR: (owner, repo, body) => request(`/repos/${owner}/${repo}/pulls`, { method: 'POST', body }),
  getPR: (owner, repo, number) => request(`/repos/${owner}/${repo}/pulls/${number}`),
  addPRComment: (owner, repo, number, body) => request(`/repos/${owner}/${repo}/pulls/${number}/comments`, { method: 'POST', body }),
  mergePR: (owner, repo, number) => request(`/repos/${owner}/${repo}/pulls/${number}/merge`, { method: 'POST' }),

  // Global Search
  search: (q, type = 'repositories') => request(`/search?q=${encodeURIComponent(q)}&type=${type}`),

  // Notifications
  getNotifications: () => request('/notifications'),
  getUnreadCount: () => request('/notifications/unread-count'),
  markNotificationsRead: (id = null) => request('/notifications/read', { method: 'PUT', body: { id } }),

  // Runner
  detectRunner: (owner, repo, branch) => request(`/runner/detect/${owner}/${repo}/${branch}`),
  startPython: (owner, repo, branch) => request(`/runner/python/${owner}/${repo}/${branch}/start`, { method: 'POST' }),
  stopPython: (owner, repo, branch) => request(`/runner/python/${owner}/${repo}/${branch}/stop`, { method: 'POST' }),
  getPythonStatus: (owner, repo, branch) => request(`/runner/python/${owner}/${repo}/${branch}/status`)
};
