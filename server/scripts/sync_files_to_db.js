const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { connectDB, getModel } = require('../config/db');
const storageService = require('../services/storageService');

async function sync() {
  await connectDB();
  const FileNode = getModel('FileNode');
  const files = await FileNode.find();
  console.log('Total files to check:', files.length);

  for (const f of files) {
    if (!f.contentBase64 && f.storage && f.storage.fileId) {
      try {
        console.log(`Fetching ${f.path} (fileId: ${f.storage.fileId})...`);
        const obj = await storageService.getFile(f.repoId, f.branch || 'main', f.path, f.storage.fileId);
        if (obj && obj.buffer) {
          const b64 = obj.buffer.toString('base64');
          await FileNode.updateOne({ _id: f._id }, { $set: { contentBase64: b64 } });
          console.log(`✅ Successfully cached base64 for: ${f.path} (${obj.buffer.length} bytes)`);
        }
      } catch (err) {
        console.error(`❌ Failed for ${f.path}:`, err.message);
      }
    } else {
      console.log(`Already has base64 or no fileId: ${f.path}`);
    }
  }

  console.log('Sync complete!');
  process.exit(0);
}

sync().catch(err => {
  console.error('Migration fatal error:', err);
  process.exit(1);
});
