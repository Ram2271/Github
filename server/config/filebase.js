const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');

const FILEBASE_KEY = process.env.FILEBASE_KEY || process.env.FILEBASE_ACCESS_KEY_ID;
const FILEBASE_SECRET = process.env.FILEBASE_SECRET || process.env.FILEBASE_SECRET_ACCESS_KEY;
const FILEBASE_BUCKET = process.env.FILEBASE_BUCKET || 'github-repo-files';
const FILEBASE_ENDPOINT = process.env.FILEBASE_ENDPOINT || 'https://s3.filebase.com';

const isConfigured = Boolean(FILEBASE_KEY && FILEBASE_SECRET);

let s3Client = null;
if (isConfigured) {
  s3Client = new S3Client({
    endpoint: FILEBASE_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: FILEBASE_KEY,
      secretAccessKey: FILEBASE_SECRET
    },
    forcePathStyle: true
  });
  console.log('[Storage] Configured with Filebase S3 endpoint:', FILEBASE_ENDPOINT);
} else {
  console.log('[Storage] Notice: FILEBASE_KEY and FILEBASE_SECRET not set in .env.');
  console.log('[Storage] Active: Local storage emulator (preserving exact S3 keys under server/storage/buckets/).');
}

// Local storage fallback directory
const LOCAL_STORAGE_DIR = path.join(__dirname, '..', 'storage', 'buckets', FILEBASE_BUCKET);
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

// Convert stream to buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const filebaseStorage = {
  isConfigured: () => isConfigured,
  bucketName: FILEBASE_BUCKET,

  /**
   * Upload an object to Filebase S3 (or local fallback)
   * @param {string} key - Complete object key (e.g. repoId/branch/path/to/file.js)
   * @param {Buffer|string} content - File buffer or string content
   * @param {string} contentType - MIME type
   * @returns {Promise<object>} Metadata reference (key, bucket, etag, cid, size, url)
   */
  async uploadObject(key, content, contentType) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const mimeType = contentType || mime.lookup(key) || 'application/octet-stream';

    if (isConfigured && s3Client) {
      const command = new PutObjectCommand({
        Bucket: FILEBASE_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          'uploaded-at': new Date().toISOString()
        }
      });
      const response = await s3Client.send(command);
      // Filebase returns the IPFS CID in x-amz-meta-cid or response ETag
      const etag = (response.ETag || '').replace(/"/g, '');
      const cid = response['x-amz-meta-cid'] || `Qm${crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 44)}`;

      return {
        provider: 'filebase',
        bucket: FILEBASE_BUCKET,
        key,
        etag,
        cid,
        size: buffer.length,
        contentType: mimeType,
        url: `https://${FILEBASE_BUCKET}.s3.filebase.com/${key}`,
        createdAt: new Date()
      };
    }

    // Local Storage Emulator
    const targetPath = path.join(LOCAL_STORAGE_DIR, key.split('/').join(path.sep));
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, buffer);

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const simulatedCid = `Qm${hash.substring(0, 44)}`;

    return {
      provider: 'filebase-local',
      bucket: FILEBASE_BUCKET,
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
   * Retrieve an object buffer from Filebase S3 (or local fallback)
   */
  async getObject(key) {
    if (isConfigured && s3Client) {
      const command = new GetObjectCommand({
        Bucket: FILEBASE_BUCKET,
        Key: key
      });
      const response = await s3Client.send(command);
      const buffer = await streamToBuffer(response.Body);
      return {
        buffer,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || buffer.length
      };
    }

    // Local Storage Emulator
    const targetPath = path.join(LOCAL_STORAGE_DIR, key.split('/').join(path.sep));
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Object not found: ${key}`);
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
   * Delete an object from Filebase S3
   */
  async deleteObject(key) {
    if (isConfigured && s3Client) {
      const command = new DeleteObjectCommand({
        Bucket: FILEBASE_BUCKET,
        Key: key
      });
      return await s3Client.send(command);
    }

    // Local Storage
    const targetPath = path.join(LOCAL_STORAGE_DIR, key.split('/').join(path.sep));
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    return { deleted: true };
  }
};

module.exports = filebaseStorage;
