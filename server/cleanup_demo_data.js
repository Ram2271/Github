require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const embeddedDb = require('./config/embeddedDb');

async function cleanup() {
  console.log('====================================================');
  console.log('🧹 Purging All Demo Accounts, Repositories & Test Data');
  console.log('====================================================');

  // 1. Clean MongoDB Atlas
  const uri = process.env.MONGODB_URI;
  if (uri) {
    console.log('[Atlas] Connecting to MongoDB Atlas...');
    if (uri.startsWith('mongodb+srv://')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      } catch (_) {}
    }

    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log('[Atlas] Connected. Purging collections in database:', mongoose.connection.name);

      const collections = await mongoose.connection.db.collections();
      for (const col of collections) {
        const count = await col.countDocuments();
        await col.deleteMany({});
        console.log(`  🗑️ Cleared collection ${col.collectionName} (${count} documents removed)`);
      }
      await mongoose.disconnect();
      console.log('✅ MongoDB Atlas database successfully wiped clean!');
    } catch (err) {
      console.error('[Atlas] Error clearing MongoDB Atlas:', err.message);
    }
  }

  // 2. Clean Embedded DB (server/data/db.json)
  const dbFile = path.join(__dirname, 'data', 'db.json');
  const emptyDb = {
    users: [],
    repositories: [],
    commits: [],
    branches: [],
    files: [],
    issues: [],
    pullRequests: [],
    notifications: [],
    activities: [],
    verificationCodes: []
  };

  try {
    fs.writeFileSync(dbFile, JSON.stringify(emptyDb, null, 2), 'utf8');
    console.log('✅ Embedded database (server/data/db.json) reset to clean empty state!');
  } catch (err) {
    console.error('Error resetting db.json:', err.message);
  }

  // 3. Clean Local Storage Emulator
  const storageDir = path.join(__dirname, 'storage', 'buckets');
  if (fs.existsSync(storageDir)) {
    try {
      fs.rmSync(storageDir, { recursive: true, force: true });
      fs.mkdirSync(storageDir, { recursive: true });
      console.log('✅ Local storage emulator buckets cleared!');
    } catch (err) {
      console.error('Error clearing storage buckets:', err.message);
    }
  }

  console.log('====================================================');
  console.log('✨ ALL DEMO REPOSITORIES AND DEMO ACCOUNTS PURGED!');
  console.log('====================================================');
  process.exit(0);
}

cleanup();
