const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const stream = require('stream');
const mime = require('mime-types');

// Environment settings
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_FOLDER_ID;

// Optional OAuth2 alternatives
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const isServiceAccountConfigured = Boolean(GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY && GOOGLE_DRIVE_FOLDER_ID);
const isOAuthConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN && GOOGLE_DRIVE_FOLDER_ID);
const isConfigured = isServiceAccountConfigured || isOAuthConfigured;

// Serverless-safe fallback emulator directory
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const LOCAL_STORAGE_DIR = isServerless
  ? path.join(os.tmpdir(), 'storage', 'google_drive_emulator')
  : path.join(__dirname, '..', 'storage', 'google_drive_emulator');

try {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
} catch (_) {}

// Lazy-initialized Google Drive client
let driveClient = null;
let authClient = null;

// In-memory key to Google Drive fileId cache for instantaneous lookups
const fileIdCache = new Map();

function getDriveClient() {
  if (driveClient) return driveClient;
  if (!isConfigured) return null;

  try {
    const { google } = require('googleapis');

    if (isOAuthConfigured) {
      const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );
      oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
      driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      console.log('[Storage] ✅ Google Drive client initialized (OAuth2 - Personal 15GB Quota)');
    } else if (isServiceAccountConfigured) {
      // Format private key properly, handling escaped \n in .env files
      const privateKey = GOOGLE_PRIVATE_KEY.includes('\\n')
        ? GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : GOOGLE_PRIVATE_KEY;

      authClient = new google.auth.JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/drive']
      });

      driveClient = google.drive({ version: 'v3', auth: authClient });
      console.log('[Storage] ✅ Google Drive client initialized (Service Account:', GOOGLE_SERVICE_ACCOUNT_EMAIL + ')');
    }

    return driveClient;
  } catch (err) {
    console.error('[Storage] Failed to initialize Google Drive client:', err.message);
    return null;
  }
}

// Convert stream to buffer helper
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', chunk => chunks.push(chunk));
    readableStream.on('error', reject);
    readableStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// Find existing Google Drive file by key
async function findDriveFileByKey(drive, key) {
  if (fileIdCache.has(key)) {
    return fileIdCache.get(key);
  }

  try {
    // Search within target folder by custom appProperties.key
    const query = `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and appProperties has { key='key' and value='${key}' } and trashed = false`;
    const res = await drive.files.list({
      q: query,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id, name, webViewLink, webContentLink, size, md5Checksum, mimeType)',
      spaces: 'drive',
      pageSize: 1
    });

    if (res.data.files && res.data.files.length > 0) {
      const file = res.data.files[0];
      fileIdCache.set(key, file);
      return file;
    }
  } catch (err) {
    // Fallback: search by name matching key basename if appProperties query isn't indexed yet
    try {
      const baseName = path.basename(key).replace(/'/g, "\\'");
      const fallbackQuery = `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name = '${baseName}' and trashed = false`;
      const resFallback = await drive.files.list({
        q: fallbackQuery,
        fields: 'files(id, name, webViewLink, webContentLink, size, md5Checksum, mimeType, appProperties)',
        spaces: 'drive',
        pageSize: 10
      });

      if (resFallback.data.files) {
        const match = resFallback.data.files.find(f => f.appProperties && f.appProperties.key === key) || resFallback.data.files[0];
        if (match) {
          fileIdCache.set(key, match);
          return match;
        }
      }
    } catch (_) {}
  }

  return null;
}

const googleDriveStorage = {
  isConfigured: () => isConfigured,
  folderId: GOOGLE_DRIVE_FOLDER_ID,

  /**
   * Upload an object to Google Drive (or local fallback emulator)
   * @param {string} key - Complete object key (e.g. repoId/branch/path/to/file.js)
   * @param {Buffer|string} content - File buffer or string content
   * @param {string} contentType - MIME type
   * @returns {Promise<object>} Storage metadata reference
   */
  async uploadObject(key, content, contentType) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const mimeType = contentType || mime.lookup(key) || 'application/octet-stream';
    const fileName = path.basename(key);
    const drive = getDriveClient();

    if (isConfigured && drive) {
      const bufferStream = new stream.PassThrough();
      bufferStream.end(buffer);

      const existingFile = await findDriveFileByKey(drive, key);

      let fileData;
      if (existingFile) {
        // Update existing file content
        const res = await drive.files.update({
          fileId: existingFile.id,
          media: {
            mimeType,
            body: bufferStream
          },
          fields: 'id, name, webViewLink, webContentLink, size, md5Checksum'
        });
        fileData = res.data;
      } else {
        // Create new file inside the dedicated Google Drive folder
        const res = await drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: fileName,
            parents: [GOOGLE_DRIVE_FOLDER_ID],
            appProperties: {
              key,
              uploadedAt: new Date().toISOString()
            }
          },
          media: {
            mimeType,
            body: bufferStream
          },
          fields: 'id, name, webViewLink, webContentLink, size, md5Checksum'
        });
        fileData = res.data;
      }

      // Update in-memory cache
      fileIdCache.set(key, fileData);

      const hash = fileData.md5Checksum || crypto.createHash('sha256').update(buffer).digest('hex');
      const simulatedCid = `Qm${hash.substring(0, 44)}`;

      return {
        provider: 'google-drive',
        fileId: fileData.id,
        folderId: GOOGLE_DRIVE_FOLDER_ID,
        key,
        etag: hash,
        cid: simulatedCid,
        size: buffer.length,
        contentType: mimeType,
        webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
        webContentLink: fileData.webContentLink || `https://drive.google.com/uc?export=download&id=${fileData.id}`,
        url: fileData.webContentLink || `/api/files/raw-storage/${encodeURIComponent(key)}`,
        createdAt: new Date()
      };
    }

    // Local Storage Emulator Fallback
    const targetPath = path.join(LOCAL_STORAGE_DIR, key.split('/').join(path.sep));
    const targetDir = path.dirname(targetPath);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, buffer);
    } catch (e) {
      console.error('[Storage Local Fallback Error]', e.message);
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const simulatedCid = `Qm${hash.substring(0, 44)}`;

    return {
      provider: 'google-drive-local',
      key,
      etag: hash.substring(0, 32),
      cid: simulatedCid,
      size: buffer.length,
      contentType: mimeType,
      url: `/api/files/raw-storage/${encodeURIComponent(key)}`,
      createdAt: new Date()
    };
  },

  /**
   * Retrieve an object buffer from Google Drive (or local fallback)
   */
  async getObject(key) {
    const drive = getDriveClient();

    if (isConfigured && drive) {
      const fileInfo = await findDriveFileByKey(drive, key);
      if (!fileInfo) {
        throw new Error(`Google Drive file not found: ${key}`);
      }

      const res = await drive.files.get(
        { fileId: fileInfo.id, alt: 'media' },
        { responseType: 'stream' }
      );

      const buffer = await streamToBuffer(res.data);
      return {
        buffer,
        contentType: fileInfo.mimeType || mime.lookup(key) || 'application/octet-stream',
        contentLength: buffer.length
      };
    }

    // Local Storage Emulator
    const targetPath = path.join(LOCAL_STORAGE_DIR, key.split('/').join(path.sep));
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Object not found in local storage emulator: ${key}`);
    }
    const buffer = fs.readFileSync(targetPath);
    const contentType = mime.lookup(key) || 'application/octet-stream';
    return {
      buffer,
      contentType,
      contentLength: buffer.length
    };
  },

  /**
   * Delete an object from Google Drive (or local fallback)
   */
  async deleteObject(key) {
    const drive = getDriveClient();

    if (isConfigured && drive) {
      const fileInfo = await findDriveFileByKey(drive, key);
      if (fileInfo) {
        fileIdCache.delete(key);
        return await drive.files.delete({ fileId: fileInfo.id });
      }
      return { deleted: false, reason: 'File not found in Google Drive' };
    }

    // Local Storage Emulator
    const targetPath = path.join(LOCAL_STORAGE_DIR, key.split('/').join(path.sep));
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (_) {}
    }
    return { deleted: true };
  }
};

if (!isConfigured) {
  console.log('[Storage] Notice: Google Drive credentials not yet configured in .env.');
  console.log('[Storage] Active: Google Drive Local Emulator (storing files under server/storage/google_drive_emulator).');
}

module.exports = googleDriveStorage;
