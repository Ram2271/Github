import React, { useState, useEffect, useRef } from 'react';
import { Monitor, Tablet, Smartphone, RotateCw, ExternalLink, Terminal, Play, Square, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { api } from '../../api';

export default function LiveRunner({ repo, branch }) {
  const [detection, setDetection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [iframeKey, setIframeKey] = useState(1);

  // Python server state
  const [pythonStatus, setPythonStatus] = useState({ status: 'stopped', logs: [], port: null });
  const [startingPy, setStartingPy] = useState(false);

  const iframeRef = useRef(null);
  const runnerUrl = `/runner/${repo.ownerUsername}/${repo.name}/${branch}/`;

  // Detect project capabilities
  useEffect(() => {
    async function loadDetection() {
      setLoading(true);
      try {
        const data = await api.detectRunner(repo.ownerUsername, repo.name, branch);
        setDetection(data.detection);

        // If python project, check its status
        if (data.detection?.isPythonProject) {
          const py = await api.getPythonStatus(repo.ownerUsername, repo.name, branch);
          setPythonStatus(py);
        }
      } catch (err) {
        console.error('Detection failed:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDetection();
  }, [repo, branch]);

  // Listen for console bridge messages posted from within the running web app
  useEffect(() => {
    function handleMessage(event) {
      if (event.data && event.data.source === 'runner-console') {
        setConsoleLogs(prev => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            type: event.data.type || 'log',
            messages: event.data.messages || [],
            timestamp: event.data.timestamp || new Date().toLocaleTimeString()
          }
        ]);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Poll Python status if running
  useEffect(() => {
    if (!detection?.isPythonProject) return;
    const interval = setInterval(async () => {
      try {
        const py = await api.getPythonStatus(repo.ownerUsername, repo.name, branch);
        setPythonStatus(py);
      } catch (_) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [detection, repo, branch]);

  const handleStartPython = async () => {
    setStartingPy(true);
    try {
      const res = await api.startPython(repo.ownerUsername, repo.name, branch);
      setPythonStatus(res);
      setIframeKey(k => k + 1);
    } catch (err) {
      alert(err.message);
    } finally {
      setStartingPy(false);
    }
  };

  const handleStopPython = async () => {
    try {
      await api.stopPython(repo.ownerUsername, repo.name, branch);
      setPythonStatus({ status: 'stopped', logs: [], port: null });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReload = () => {
    setIframeKey(k => k + 1);
  };

  const clearConsole = () => {
    setConsoleLogs([]);
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-gh-muted animate-pulse">
        Detecting web project &amp; starting server environment...
      </div>
    );
  }

  const deviceWidths = {
    desktop: 'w-full',
    tablet: 'w-[768px]',
    mobile: 'w-[375px]'
  };

  return (
    <div className="space-y-4">
      {/* Project Capabilities Banner */}
      <div className="bg-gh-surface border border-gh-border rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Play className="w-5 h-5 fill-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gh-text">Integrated Web Project Runner</h2>
              {detection?.isWebProject && (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Static Web Server Ready
                </span>
              )}
              {detection?.isPythonProject && (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-sky-950/60 text-sky-400 border border-sky-800/60 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Python Web Server Ready
                </span>
              )}
            </div>
            <p className="text-xs text-gh-muted mt-0.5">
              {detection?.isWebProject
                ? `Entry point detected: ${detection.webEntryPoint}. Serving all relative CSS, JS, and assets directly via local HTTP.`
                : detection?.isPythonProject
                ? `Python entry point detected: ${detection.pythonEntryPoint}. Launch native local server process with one click.`
                : 'Add an index.html or app.py to this repository to run it live.'}
            </p>
          </div>
        </div>

        {/* Python Server Controls */}
        {detection?.isPythonProject && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {pythonStatus.status === 'running' ? (
              <button
                onClick={handleStopPython}
                className="px-3.5 py-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800/80 text-red-300 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-red-400 text-red-400" /> Stop Server (Port {pythonStatus.port})
              </button>
            ) : (
              <button
                onClick={handleStartPython}
                disabled={startingPy}
                className="px-4 py-1.5 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> {startingPy ? 'Launching Python...' : 'Start Python Server'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Runner Browser Frame */}
      <div className="border border-gh-border rounded-xl bg-gh-surface overflow-hidden shadow-2xl">
        {/* Browser Top Navigation Bar */}
        <div className="px-4 py-2.5 bg-gh-subtle/80 border-b border-gh-border flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left: Window Dots & Reload */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            </div>

            <button
              onClick={handleReload}
              className="p-1 hover:bg-gh-surface rounded text-gh-muted hover:text-gh-text transition-colors"
              title="Reload preview"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center: Address Bar */}
          <div className="flex-1 max-w-xl">
            <div className="bg-gh-bg border border-gh-border rounded-md px-3 py-1 text-xs font-mono text-gh-muted flex items-center justify-between">
              <span className="truncate text-gh-text">{runnerUrl}</span>
              <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold ml-2">HTTP 200</span>
            </div>
          </div>

          {/* Right: Device Viewport Switches & Popout */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gh-bg border border-gh-border rounded-md p-0.5 text-gh-muted">
              <button
                onClick={() => setDevice('desktop')}
                className={`p-1 rounded ${device === 'desktop' ? 'bg-gh-surface text-gh-text' : 'hover:text-gh-text'}`}
                title="Desktop view"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDevice('tablet')}
                className={`p-1 rounded ${device === 'tablet' ? 'bg-gh-surface text-gh-text' : 'hover:text-gh-text'}`}
                title="Tablet view (768px)"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={`p-1 rounded ${device === 'mobile' ? 'bg-gh-surface text-gh-text' : 'hover:text-gh-text'}`}
                title="Mobile view (375px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>

            <a
              href={runnerUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 hover:bg-gh-surface border border-gh-border rounded-md text-gh-muted hover:text-gh-text transition-colors flex items-center gap-1"
              title="Open in new window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Iframe Viewport Container */}
        <div className="bg-[#090d16] p-4 flex justify-center min-h-[500px] overflow-auto">
          <div className={`${deviceWidths[device]} transition-all duration-300 flex justify-center`}>
            {detection?.isWebProject || (detection?.isPythonProject && pythonStatus.status === 'running') ? (
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={runnerUrl}
                title="Web Project Live Runner"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                className="w-full h-[580px] bg-white rounded border border-gh-border shadow-2xl"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-16 text-center text-gh-muted space-y-3">
                <AlertTriangle className="w-10 h-10 text-gh-gold" />
                <h3 className="text-base font-semibold text-gh-text">Project Runner Not Active</h3>
                <p className="text-xs max-w-md">
                  {detection?.isPythonProject
                    ? 'Click "Start Python Server" above to launch the application process and begin live preview.'
                    : 'This repository does not appear to have an index.html file. Create an index.html file in the code tab to run it here.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Console / Terminal Drawer */}
        <div className="border-t border-gh-border bg-gh-surface">
          <div className="px-4 py-2 border-b border-gh-border/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-semibold text-gh-text">
              <Terminal className="w-4 h-4 text-gh-muted" />
              <span>Developer Console</span>
              <span className="px-1.5 py-0.2 bg-gh-subtle border border-gh-border rounded-full text-[10px] text-gh-muted font-mono">
                {consoleLogs.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearConsole}
                className="text-[11px] text-gh-muted hover:text-gh-text font-medium"
              >
                Clear
              </button>
              <button
                onClick={() => setConsoleOpen(!consoleOpen)}
                className="text-[11px] text-gh-link hover:underline font-medium ml-2"
              >
                {consoleOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>

          {consoleOpen && (
            <div className="p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1.5 bg-[#0d1117]">
              {consoleLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-[10px] text-gh-muted select-none flex-shrink-0">{log.timestamp}</span>
                  <span
                    className={`text-[10px] uppercase font-bold px-1 rounded flex-shrink-0 ${
                      log.type === 'error'
                        ? 'bg-red-950 text-red-400 border border-red-800'
                        : log.type === 'warn'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-sky-950 text-sky-400 border border-sky-800'
                    }`}
                  >
                    {log.type}
                  </span>
                  <span className="text-gh-text break-words">
                    {log.messages.join(' ')}
                  </span>
                </div>
              ))}

              {consoleLogs.length === 0 && (
                <div className="text-gh-muted italic text-[11px]">
                  No console logs recorded yet. Interact with the application to see logs stream here in real-time.
                </div>
              )}

              {/* Python server logs if applicable */}
              {detection?.isPythonProject && pythonStatus.logs?.length > 0 && (
                <div className="pt-3 border-t border-gh-border/40 mt-3">
                  <div className="text-[11px] font-semibold text-gh-muted mb-1">Python Process Output:</div>
                  {pythonStatus.logs.map((l, idx) => (
                    <div key={idx} className="text-emerald-400 text-[11px] flex gap-2">
                      <span className="text-gh-muted">{l.time}</span>
                      <span>{l.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
