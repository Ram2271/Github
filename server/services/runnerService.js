const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FileNode = require('../models/FileNode');
const Repository = require('../models/Repository');
const storage = require('../config/googleDrive');

// Map of running python processes: `${repoId}:${branch}` => { process, port, logs: [], status: 'running'|'stopped' }
const pythonProcesses = new Map();
let nextPythonPort = 5200;

class RunnerService {
  /**
   * Scans a repository file list and determines web / python project capabilities
   */
  async detectProject(repoId, branchName = 'main') {
    const files = await FileNode.find({ repoId, branch: branchName, type: 'file' });
    const paths = files.map(f => f.path.toLowerCase());

    const hasIndexHtml = paths.includes('index.html') || paths.some(p => p.endsWith('/index.html'));
    const indexEntry = paths.find(p => p === 'index.html' || p.endsWith('/index.html')) || 'index.html';

    const pythonFiles = ['app.py', 'main.py', 'server.py', 'wsgi.py'];
    const pythonEntry = paths.find(p => pythonFiles.includes(p) || pythonFiles.some(pf => p.endsWith('/' + pf)));

    return {
      isWebProject: Boolean(hasIndexHtml),
      isPythonProject: Boolean(pythonEntry),
      webEntryPoint: hasIndexHtml ? indexEntry : null,
      pythonEntryPoint: pythonEntry || null,
      totalFiles: files.length
    };
  }

  /**
   * Detects and tags the Repository record in MongoDB
   */
  async detectAndTagRepo(repoId, branchName = 'main') {
    try {
      const detection = await this.detectProject(repoId, branchName);
      await Repository.updateOne(
        { _id: repoId },
        {
          $set: {
            isWebProject: detection.isWebProject,
            isPythonProject: detection.isPythonProject,
            runnerEntryPoint: detection.webEntryPoint || detection.pythonEntryPoint || null
          }
        }
      );
      return detection;
    } catch (err) {
      console.error('[RunnerService] Detection error:', err.message);
      return null;
    }
  }

  /**
   * Serves a static web project file with live console injection for HTML
   */
  async getWebProjectAsset(repoId, branch, requestedPath) {
    let normalizedPath = requestedPath ? requestedPath.replace(/^\/+/, '') : '';
    if (!normalizedPath || normalizedPath.endsWith('/')) {
      normalizedPath = (normalizedPath ? normalizedPath : '') + 'index.html';
    }

    const key = `${repoId}/${branch}/${normalizedPath}`;

    try {
      const file = await storage.getObject(key);
      let buffer = file.buffer;
      let contentType = file.contentType;

      // If it's HTML, inject the Runner Console bridge script
      if (contentType.includes('text/html') || normalizedPath.endsWith('.html')) {
        let html = buffer.toString('utf8');
        const injectionScript = `
<!-- GitHub Live Runner Console Bridge -->
<script>
(function() {
  function sendLog(type, args) {
    try {
      var msgs = Array.from(args).map(function(item) {
        if (item === null) return 'null';
        if (item === undefined) return 'undefined';
        if (typeof item === 'object') {
          try { return JSON.stringify(item); } catch(_) { return String(item); }
        }
        return String(item);
      });
      window.parent.postMessage({
        source: 'runner-console',
        type: type,
        messages: msgs,
        timestamp: new Date().toLocaleTimeString()
      }, '*');
    } catch(e) {}
  }

  var methods = ['log', 'info', 'warn', 'error'];
  methods.forEach(function(m) {
    var orig = console[m];
    console[m] = function() {
      sendLog(m, arguments);
      if (orig) orig.apply(console, arguments);
    };
  });

  window.addEventListener('error', function(e) {
    sendLog('error', [e.message + ' (' + (e.filename || 'script') + ':' + e.lineno + ')']);
  });
})();
</script>
`;
        if (html.includes('</body>')) {
          html = html.replace('</body>', `${injectionScript}</body>`);
        } else {
          html += injectionScript;
        }
        buffer = Buffer.from(html, 'utf8');
      }

      return {
        buffer,
        contentType,
        found: true
      };
    } catch (err) {
      // Check fallback to root index.html for Single Page Apps (SPA) routing
      if (!normalizedPath.includes('.') && !normalizedPath.endsWith('.html')) {
        return this.getWebProjectAsset(repoId, branch, 'index.html');
      }
      return { found: false, error: err.message };
    }
  }

  /**
   * Starts a local Python web server for the repository
   */
  async startPythonServer(repoId, branch = 'main') {
    const processKey = `${repoId}:${branch}`;
    const existing = pythonProcesses.get(processKey);
    if (existing && existing.status === 'running') {
      return {
        success: true,
        port: existing.port,
        message: 'Python server is already running',
        status: 'running'
      };
    }

    const files = await FileNode.find({ repoId, branch, type: 'file' });
    const pyEntryNode = files.find(f => ['app.py', 'main.py', 'server.py'].includes(f.name.toLowerCase()));

    if (!pyEntryNode) {
      throw new Error('No Python web entry point (app.py, main.py, server.py) found in repository.');
    }

    // Prepare temp directory (using os.tmpdir() for serverless / cloud safety)
    const tempDir = path.join(require('os').tmpdir(), 'temp_runners', `${repoId}_${branch}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Export files to directory
    for (const fileNode of files) {
      try {
        const key = `${repoId}/${branch}/${fileNode.path}`;
        const obj = await storage.getObject(key);
        const filePath = path.join(tempDir, fileNode.path.split('/').join(path.sep));
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        fs.writeFileSync(filePath, obj.buffer);
      } catch (e) {
        console.error(`[PythonRunner] Error writing ${fileNode.path}:`, e.message);
      }
    }

    const port = nextPythonPort++;
    const logs = [];

    // Spawn python process
    const proc = spawn('python', [pyEntryNode.path], {
      cwd: tempDir,
      env: {
        ...process.env,
        PORT: String(port),
        FLASK_RUN_PORT: String(port),
        PYTHONUNBUFFERED: '1'
      }
    });

    const addLog = (msg) => {
      logs.push({ time: new Date().toLocaleTimeString(), text: msg.trim() });
      if (logs.length > 200) logs.shift();
    };

    proc.stdout.on('data', data => addLog(data.toString()));
    proc.stderr.on('data', data => addLog(data.toString()));

    proc.on('close', code => {
      addLog(`Process exited with code ${code}`);
      const procInfo = pythonProcesses.get(processKey);
      if (procInfo) procInfo.status = 'stopped';
    });

    pythonProcesses.set(processKey, {
      process: proc,
      port,
      logs,
      entryPoint: pyEntryNode.path,
      status: 'running',
      startedAt: new Date()
    });

    return {
      success: true,
      port,
      entryPoint: pyEntryNode.path,
      status: 'running',
      message: `Python server launched on port ${port}`
    };
  }

  /**
   * Stops running Python server
   */
  stopPythonServer(repoId, branch = 'main') {
    const processKey = `${repoId}:${branch}`;
    const procInfo = pythonProcesses.get(processKey);
    if (procInfo && procInfo.process) {
      try {
        procInfo.process.kill();
      } catch (_) {}
      procInfo.status = 'stopped';
      pythonProcesses.delete(processKey);
      return { success: true, message: 'Server stopped.' };
    }
    return { success: false, message: 'No server was running.' };
  }

  /**
   * Gets Python server status and logs
   */
  getPythonServerStatus(repoId, branch = 'main') {
    const processKey = `${repoId}:${branch}`;
    const procInfo = pythonProcesses.get(processKey);
    if (!procInfo) {
      return { status: 'stopped', logs: [], port: null };
    }
    return {
      status: procInfo.status,
      port: procInfo.port,
      logs: procInfo.logs,
      startedAt: procInfo.startedAt,
      entryPoint: procInfo.entryPoint
    };
  }
}

module.exports = new RunnerService();
