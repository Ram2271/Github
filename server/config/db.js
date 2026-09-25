const mongoose = require('mongoose');
const dns = require('dns');
const crypto = require('crypto');
const embeddedDb = require('./embeddedDb');

let isConnectedToMongo = false;
let connectionPromise = null;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    isConnectedToMongo = false;
    return;
  }

  // If already connected, return immediately
  if (mongoose.connection.readyState === 1) {
    isConnectedToMongo = true;
    return;
  }

  // If connection is currently in progress, await existing promise
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      if (uri.startsWith('mongodb+srv://') && process.platform === 'win32') {
        try {
          dns.setServers(['8.8.8.8', '1.1.1.1']);
        } catch (_) {}
      }

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000
      });
      isConnectedToMongo = true;
      console.log('[DB] ✅ Connected successfully to MongoDB Atlas:', uri.replace(/\/\/.*@/, '//***@'));
    } catch (err) {
      isConnectedToMongo = false;
      connectionPromise = null;
      console.error('[DB] ⚠️ External MongoDB connection failed (' + err.message + ').');
    }
  })();

  return connectionPromise;
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

function getMongooseModel(name, collName) {
  if (mongoose.models[name]) {
    return mongoose.models[name];
  }
  const flexSchema = new mongoose.Schema(
    {
      _id: {
        type: String,
        default: () => crypto.randomBytes(12).toString('hex')
      }
    },
    {
      strict: false,
      timestamps: true,
      versionKey: false,
      collection: collName
    }
  );
  return mongoose.model(name, flexSchema, collName);
}

function normalizeQuery(query = {}) {
  if (!query || typeof query !== 'object') return {};
  const copy = { ...query };
  if (copy._id && typeof copy._id !== 'object') {
    copy._id = String(copy._id);
  }
  return copy;
}

function normalizeUpdate(update = {}) {
  const now = new Date();
  const hasOperators = Object.keys(update).some(k => k.startsWith('$'));
  if (hasOperators) {
    return {
      ...update,
      $set: {
        ...(update.$set || {}),
        updatedAt: now
      }
    };
  }
  return {
    $set: {
      ...update,
      updatedAt: now
    }
  };
}

function getModel(name) {
  const collName = collectionMap[name.toLowerCase()] || (name.toLowerCase() + 's');
  const Model = getMongooseModel(name, collName);
  const embedded = embeddedDb.getCollection(collName);

  const useMongo = () => isConnectedToMongo || mongoose.connection.readyState === 1;

  return {
    find(query = {}) {
      if (useMongo()) {
        return Model.find(normalizeQuery(query)).lean();
      }
      return embedded.find(query);
    },
    async findOne(query = {}) {
      if (useMongo()) {
        return await Model.findOne(normalizeQuery(query)).lean();
      }
      return await embedded.findOne(query);
    },
    async findById(id) {
      if (!id) return null;
      if (useMongo()) {
        return await Model.findOne({ _id: String(id) }).lean();
      }
      return await embedded.findById(id);
    },
    async create(docOrDocs) {
      if (useMongo()) {
        const now = new Date();
        if (Array.isArray(docOrDocs)) {
          const docs = docOrDocs.map(d => ({
            _id: d._id ? String(d._id) : crypto.randomBytes(12).toString('hex'),
            createdAt: d.createdAt || now,
            updatedAt: d.updatedAt || now,
            ...d
          }));
          const res = await Model.insertMany(docs);
          return res.map(r => (r.toObject ? r.toObject() : r));
        } else {
          const doc = {
            _id: docOrDocs._id ? String(docOrDocs._id) : crypto.randomBytes(12).toString('hex'),
            createdAt: docOrDocs.createdAt || now,
            updatedAt: docOrDocs.updatedAt || now,
            ...docOrDocs
          };
          const res = await Model.create(doc);
          return res.toObject ? res.toObject() : res;
        }
      }
      return await embedded.create(docOrDocs);
    },
    async findByIdAndUpdate(id, update, options = { new: true }) {
      if (!id) return null;
      if (useMongo()) {
        return await Model.findOneAndUpdate(
          { _id: String(id) },
          normalizeUpdate(update),
          { new: true, ...options }
        ).lean();
      }
      return await embedded.findByIdAndUpdate(id, update, options);
    },
    async updateOne(query, update, options = {}) {
      if (useMongo()) {
        return await Model.findOneAndUpdate(
          normalizeQuery(query),
          normalizeUpdate(update),
          { new: true, ...options }
        ).lean();
      }
      return await embedded.updateOne(query, update, options);
    },
    async updateMany(query, update) {
      if (useMongo()) {
        return await Model.updateMany(normalizeQuery(query), normalizeUpdate(update));
      }
      return await embedded.updateMany(query, update);
    },
    async findByIdAndDelete(id) {
      if (!id) return null;
      if (useMongo()) {
        return await Model.findOneAndDelete({ _id: String(id) }).lean();
      }
      return await embedded.findByIdAndDelete(id);
    },
    async deleteOne(query) {
      if (useMongo()) {
        return await Model.deleteOne(normalizeQuery(query));
      }
      return await embedded.deleteOne(query);
    },
    async deleteMany(query) {
      if (useMongo()) {
        return await Model.deleteMany(normalizeQuery(query));
      }
      return await embedded.deleteMany(query);
    },
    async countDocuments(query = {}) {
      if (useMongo()) {
        return await Model.countDocuments(normalizeQuery(query));
      }
      return await embedded.countDocuments(query);
    }
  };
}

module.exports = {
  connectDB,
  getModel,
  isConnected: () => isConnectedToMongo || mongoose.connection.readyState === 1
};
