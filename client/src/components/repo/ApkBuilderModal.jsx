import React, { useState } from 'react';
import { Smartphone, X, CheckCircle2, Download, Sparkles, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../api';

export default function ApkBuilderModal({ repo, branch, subpath, indexHtmlPath, onClose, onSuccess }) {
  const defaultPkg = `com.${(repo.ownerUsername || 'dev').replace(/[^a-z0-9]/gi, '').toLowerCase()}.${(repo.name || 'app').replace(/[^a-z0-9]/gi, '').toLowerCase()}`;

  const [appName, setAppName] = useState(repo.name || 'My Web App');
  const [packageId, setPackageId] = useState(defaultPkg);
  const [version, setVersion] = useState('1.0.0');
  const [orientation, setOrientation] = useState('landscape');
  const [fullscreen, setFullscreen] = useState(true);
  const [iconFile, setIconFile] = useState(null);

  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const triggerDownloadFromBase64 = (base64Data, filename) => {
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.android.package-archive' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (_) {}
  };

  const handleBuild = async (e) => {
    e.preventDefault();
    if (building) return;

    setBuilding(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('branch', branch);
      formData.append('subpath', subpath || '');
      formData.append('appName', appName.trim() || repo.name);
      formData.append('packageId', packageId.trim() || defaultPkg);
      formData.append('version', version.trim() || '1.0.0');
      formData.append('orientation', orientation);
      formData.append('fullscreen', String(fullscreen));
      if (iconFile) {
        formData.append('icon', iconFile);
      }

      const res = await api.buildRepoApk(repo.ownerUsername, repo.name, formData);
      setResult(res);

      // Refresh repository file tree so the newly committed .apk file immediately shows up in the repo
      if (onSuccess) {
        onSuccess(res);
      }

      // Automatically trigger APK download for convenience
      if (res.apkBase64 && res.apkFileName) {
        triggerDownloadFromBase64(res.apkBase64, res.apkFileName);
      }
    } catch (err) {
      setError(err.message || 'Failed to build Android APK.');
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
      <div className="bg-gh-surface border border-gh-border rounded-lg max-w-lg w-full overflow-hidden shadow-2xl text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gh-border flex items-center justify-between bg-gh-subtle/40">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                Android APK Builder
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
                  V1 + V2 Signed
                </span>
              </h3>
              <p className="text-[11px] text-gh-muted">
                Detected entry point: <code className="text-emerald-400 font-mono">{indexHtmlPath || 'index.html'}</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gh-muted hover:text-white rounded-md hover:bg-gh-subtle transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-950/50 border border-red-800/60 text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-700/50 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="text-sm font-semibold text-white">
                  {result.apkFileName} Built & Added to Repository!
                </div>
                <p className="text-gh-muted text-xs">
                  Your signed Android APK (<code className="text-emerald-300 font-mono">{result.packageId}</code> v{result.version}) has been automatically committed to <strong className="text-white">{repo.ownerUsername}/{repo.name}</strong> on branch <code className="text-gh-link">{branch}</code>.
                </p>
              </div>

              <div className="bg-gh-bg border border-gh-border rounded-md p-3 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gh-muted">File added to repo:</span>
                  <span className="text-emerald-400 font-semibold">{result.apkFileName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gh-muted">Package ID:</span>
                  <span className="text-gh-text">{result.packageId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gh-muted">Signature Scheme:</span>
                  <span className="text-gh-text">JAR (v1) + APK Sig Block 42 (v2)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gh-muted">APK Size:</span>
                  <span className="text-gh-text">{(result.apkSize / 1024).toFixed(1)} KB</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (result.apkBase64) {
                      triggerDownloadFromBase64(result.apkBase64, result.apkFileName);
                    } else if (result.downloadUrl) {
                      window.open(result.downloadUrl, '_blank');
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gh-green hover:bg-gh-greenHover text-white rounded-md font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {result.apkFileName}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gh-subtle hover:bg-gh-border text-gh-text rounded-md font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleBuild} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gh-text font-semibold mb-1">App Name</label>
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    maxLength={40}
                    required
                    className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-gh-text focus:outline-none focus:border-gh-link"
                  />
                </div>
                <div>
                  <label className="block text-gh-text font-semibold mb-1">Version</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    maxLength={20}
                    required
                    className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-gh-text font-mono focus:outline-none focus:border-gh-link"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gh-text font-semibold mb-1">Android Package ID</label>
                <input
                  type="text"
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  maxLength={60}
                  required
                  placeholder="com.yourname.appname"
                  className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-gh-text font-mono focus:outline-none focus:border-gh-link"
                />
                <span className="text-[10px] text-gh-muted mt-0.5 block">
                  Unique Android application identifier (allows installing multiple apps side-by-side).
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gh-text font-semibold mb-1">Screen Orientation</label>
                  <select
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value)}
                    className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-1.5 text-gh-text focus:outline-none focus:border-gh-link"
                  >
                    <option value="landscape">Landscape (Game Mode)</option>
                    <option value="portrait">Portrait (Mobile App)</option>
                    <option value="sensor">Auto-Rotate (Sensor)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gh-text font-semibold mb-1">App Icon (Optional PNG)</label>
                  <label className="flex items-center justify-center gap-1.5 w-full bg-gh-bg hover:bg-gh-subtle border border-dashed border-gh-border rounded-md px-3 py-1.5 text-gh-muted hover:text-gh-text cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span className="truncate">{iconFile ? iconFile.name : 'Upload PNG Icon'}</span>
                    <input
                      type="file"
                      accept="image/png"
                      onChange={(e) => setIconFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="apk-fullscreen"
                  checked={fullscreen}
                  onChange={(e) => setFullscreen(e.target.checked)}
                  className="rounded border-gh-border bg-gh-bg text-gh-green focus:ring-0"
                />
                <label htmlFor="apk-fullscreen" className="text-gh-text cursor-pointer">
                  Enable Immersive Fullscreen WebView (hides Android status & navigation bars)
                </label>
              </div>

              <div className="pt-3 border-t border-gh-border flex items-center justify-between gap-2">
                <span className="text-[11px] text-gh-muted">
                  Automatically saves & commits <code className="text-gh-text font-mono">{repo.name}.apk</code> into this repo.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 bg-gh-subtle hover:bg-gh-border text-gh-text rounded-md font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={building}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md font-semibold shadow-sm transition-colors"
                  >
                    {building ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Building APK...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Build & Add APK to Repo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
