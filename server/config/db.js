const mongoose = require('mongoose');
const dns = require('dns');
const embeddedDb = require('./embeddedDb');

let isConnectedToMongo = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    isConnectedToMongo = false;
    console.log('[DB] MONGODB_URI not provided. Active: Embedded Persistent Database (server/data/db.json).');
    console.log('[DB] To connect to external MongoDB/Atlas, set MONGODB_URI in .env.');
    return;
  }

  try {
    if (uri.startsWith('mongodb+srv://')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      } catch (_) {}
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    isConnectedToMongo = true;
    console.log('[DB] ✅ Connected successfully to MongoDB Atlas:', uri.replace(/\/\/.*@/, '//***@'));
  } catch (err) {
    isConnectedToMongo = false;
    console.log('[DB] Notice: External MongoDB not reachable (' + err.message + ').');
    console.log('[DB] Seamlessly active: Embedded Persistent Database (server/data/db.json).');
  }
}

const collectionMap = {
  activity: 'activities',
  repository: 'repositories',
  user: 'users',
  commit: 'commits',
  branch: 'branches',
  filenode: 'files',
  issue: 'issues',
  pullrequest: 'pullRequests',
  notification: 'notifications',
  verificationcode: 'verificationCodes'
};

function getModel(name, schema) {
  const collName = collectionMap[name.toLowerCase()] || (name.toLowerCase() + 's');
  const embedded = embeddedDb.getCollection(collName);
  
  return {
    find(query = {}) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].find(query).lean();
      }
      return embedded.find(query);
    },
    async findOne(query = {}) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].findOne(query).lean();
      }
      return embedded.findOne(query);
    },
    async findById(id) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].findById(id).lean();
      }
      return embedded.findById(id);
    },
    async create(docOrDocs) {
      if (isConnectedToMongo && mongoose.models[name]) {
        const res = await mongoose.models[name].create(docOrDocs);
        return Array.isArray(res) ? res.map(r => r.toObject()) : res.toObject();
      }
      return embedded.create(docOrDocs);
    },
    async findByIdAndUpdate(id, update, options = { new: true }) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].findByIdAndUpdate(id, update, { new: true, ...options }).lean();
      }
      return embedded.findByIdAndUpdate(id, update, options);
    },
    async updateOne(query, update, options = {}) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].updateOne(query, update, options);
      }
      return embedded.updateOne(query, update, options);
    },
    async updateMany(query, update) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].updateMany(query, update);
      }
      return embedded.updateMany(query, update);
    },
    async findByIdAndDelete(id) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].findByIdAndDelete(id).lean();
      }
      return embedded.findByIdAndDelete(id);
    },
    async deleteOne(query) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].deleteOne(query);
      }
      return embedded.deleteOne(query);
    },
    async deleteMany(query) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].deleteMany(query);
      }
      return embedded.deleteMany(query);
    },
    async countDocuments(query = {}) {
      if (isConnectedToMongo && mongoose.models[name]) {
        return mongoose.models[name].countDocuments(query);
      }
      return embedded.countDocuments(query);
    }
  };
}

module.exports = {
  connectDB,
  getModel,
  isConnected: () => isConnectedToMongo
};
