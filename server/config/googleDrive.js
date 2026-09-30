const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const stream = require('stream');
const mime = require('mime-types');

// Built-in Service Account fallback (ensures permanent JWT auth without expiring OAuth tokens)
const DEFAULT_SERVICE_EMAIL = 'github-storage-service@github-storage-509510.iam.gserviceaccount.com';
const DEFAULT_FOLDER_ID = '1nCGdIDKnLUOr5ZwYmzz_N7ncEKl-6FJA';
const DEFAULT_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDxg2JzICwMAnuD
2pGtH9SIbWUt3Z5oJRYUmGIf7lduZRZMw0DBlhnGVQCLGN6W/XX9s1IMK2YtYqhj
C9RqiVW0/3+BpXwehIBmIpHO/BuEAgYEmkhUNBYnV96Ux9YS8vUKSUYEYB4g1CEV
xUFWB8/lUleM2JK1jktgOMavEG9T5TNSZbv8dih4yfpP7gJ3bsStTm0GovNrhPhc
GZY1z4k2miuTO//6tl8ujsKA82EhbrxbMJCTnPYjRZJPELxGO8LIbpqrIDSiLfmk
2SB97Q5/ZWcBVwuA8tmhjr6Qkuk2TCeHb2D5WFSPD/4dhbMQ1EtuRP0xB6UyPM68
HFMT44TXAgMBAAECggEABC/16y73HW34CJi17f84OoPCmdUIkFixJyW0jWKe5x3t
dKnRURu12T+htQ7MYhMFfTEVA+0ce3eFJ/2UdhSh0yy3irsuu1ecqoUdB/WFmNS4
X2+AP97T/J0ydSMj2lLPSO7fE0tYcX4MD7FKkFHKPnkenrOXsAh/KfRQRgGKqe3Y
frfPTTrYrYKC5RJoeR/WqCIPn7Oe5gtOmVtuUZe++KgkKryTRDhUGd8BT9KN00Ts
pAgHYDT1NBlE32IC9vqE6tFbfdjqTgVPODS6lhSOgCAw8oGnH9kfrpSPo/hIh3qI
4wDgQDvtcQj8XZQbPl+WmZ5Z1WDjXAdYPykaT0tVnQKBgQD9hCCQzjhHfzsh7zLy
joiAhMrwOxvwmpvJ4oSS1xUdfX3UXwiCAX7Eic75fFm9j0McltJs0pCo81Z56Osj
6gjPRJ559iTAaCRTC1nW9dRWVGDQnlozAhv9UazYklQAatPeOyBhuHzs2TvP9Q+C
vtV6WyDvLgGUQMMC5uAudUi1UwKBgQDz4SbJZI4UkA0lTExRifquDeRbffUlaX2h
7X2a8ISys3cmZ5B5+g83UVPqE0mGbB0zSLQ8jwtocq2aWUGEKSXYSmm8VBztKb2S
SCbOCWjulhQUNURyuTxGZ+83XlO5eTWkKMcSurClkA7RRWf49uAlDStDNJBriApz
MJ1AtGnd7QKBgQDqo4zEmalrOy4OxWZhK1zZno559Cty8JY6L6ZGhj1r0wdQNTkZ
oqqi222uadJhaSRTZKCTyfvL85TZNqPT1LucosUO2qu/TWQ5XGslUtfZozUMQVP4
m/4t4pdYx25qCHXZ3N2mtGsjiBgc7JMTju7k1U1RMkKR5bLYj7l0JmdKMwKBgQDv
Px1xzHelrHt475SfGSEWxwISz0pC3W4mAHmMGg/Tz0NAJbESOEHdHqeXpjwm5sDu
opBOKHYkjPvJw24GXOeHe9imrE2ES8JxUt7emVSbWhdwi6EOerGq0CNYyeyQs1vw
IyDIOuU4Rk6C9fe9wVK6hmS+lT5ofxjhT/u0kkiZMQKBgCZ1bTjZzq5cbkmcEM1U
GJk8xYc4UEwTnxYQHpPCPLtUJsMsoGPuN7zsuS5DmPWAuzQ5lYgPLRjaed5EupGv
jtAwIEQP4vKZ9SuHlG85sASrwlhPFZRqKvlq2DtJfr491oDrkAJmxua2L7mZDOVx
ouTV3Lh/deHAYPvEr+BB5o+E
-----END PRIVATE KEY-----`;

// Environment settings
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || DEFAULT_SERVICE_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_FOLDER_ID || DEFAULT_FOLDER_ID;

// Optional OAuth2 alternatives (disabled by default to prevent invalid_grant token expiry)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const isServiceAccountConfigured = Boolean(GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY && GOOGLE_DRIVE_FOLDER_ID);
const isOAuthConfigured = false; // Always prefer Service Account to completely avoid OAuth invalid_grant
const isConfigured = isServiceAccountConfigured;

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

    if (isServiceAccountConfigured) {
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
    } else if (isOAuthConfigured) {
      const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback'
      );
      oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
      driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      console.log('[Storage] ✅ Google Drive client initialized (OAuth2)');
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
      try {
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
            fields: 'id, name, webViewLink, webContentLink, size, md5Checksum',
            supportsAllDrives: true
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
      } catch (driveErr) {
        console.warn(`[Storage] Google Drive upload notice (${driveErr.message}), falling back to direct database persistence`);
      }
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
  async getObject(key, fileId = null) {
    const drive = getDriveClient();

    if (isConfigured && drive) {
      // 1. Direct fetch by fileId if provided
      if (fileId) {
        try {
          const res = await drive.files.get(
            { fileId, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' }
          );
          const buffer = await streamToBuffer(res.data);
          return {
            buffer,
            contentType: mime.lookup(key) || 'application/octet-stream',
            contentLength: buffer.length
          };
        } catch (fileIdErr) {
          console.warn(`[Storage] Failed to retrieve by fileId (${fileId}): ${fileIdErr.message}, falling back to key query...`);
        }
      }

      // 2. Query Google Drive by key
      const fileInfo = await findDriveFileByKey(drive, key);
      if (fileInfo) {
        const res = await drive.files.get(
          { fileId: fileInfo.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'stream' }
        );

        const buffer = await streamToBuffer(res.data);
        return {
          buffer,
          contentType: fileInfo.mimeType || mime.lookup(key) || 'application/octet-stream',
          contentLength: buffer.length
        };
      }

      console.warn(`[Storage] Google Drive file not found by key: ${key}`);
    }

    // Local Storage Emulator
    const targetPath = path.join(LOCAL_STORAGE_DIR, key.split('/').join(path.sep));
    if (!fs.existsSync(targetPath)) {
      throw new Error(`File not found in storage: ${key}`);
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
