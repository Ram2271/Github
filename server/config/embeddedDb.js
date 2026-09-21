const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isServerless ? path.join(os.tmpdir(), 'data') : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  // Gracefully handle read-only file systems (e.g. AWS Lambda / Vercel Serverless)
}

let memoryDb = {
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

let lastLoadedMtime = 0;

function loadDbFromDisk() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const stats = fs.statSync(DB_FILE);
      if (stats.mtimeMs > lastLoadedMtime) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        memoryDb = { ...memoryDb, ...parsed };
        lastLoadedMtime = stats.mtimeMs;
      }
    } catch (err) {
      // Ignore transient read lock
    }
  }
}

// Initial load
loadDbFromDisk();

let saveTimer = null;
function persistDb(immediate = true) {
  if (saveTimer) clearTimeout(saveTimer);
  const doSave = () => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(memoryDb, null, 2), 'utf8');
      if (fs.existsSync(DB_FILE)) {
        lastLoadedMtime = fs.statSync(DB_FILE).mtimeMs;
      }
    } catch (err) {
      console.error('[DB] Failed to persist db.json:', err.message);
    }
  };

  if (immediate) {
    doSave();
  } else {
    saveTimer = setTimeout(doSave, 50);
  }
}

function matchQuery(doc, query = {}) {
  if (!query) return true;
  for (const [key, val] of Object.entries(query)) {
    if (key === '$or') {
      const matched = val.some(subQuery => matchQuery(doc, subQuery));
      if (!matched) return false;
      continue;
    }
    if (key === '$and') {
      const matched = val.every(subQuery => matchQuery(doc, subQuery));
      if (!matched) return false;
      continue;
    }

    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof RegExp)) {
      if ('$in' in val) {
        const itemVal = doc[key];
        const inArray = Array.isArray(itemVal) ? itemVal.some(v => val.$in.includes(v)) : val.$in.includes(itemVal);
        if (!inArray) return false;
        continue;
      }
      if ('$ne' in val) {
        if (doc[key] === val.$ne) return false;
        continue;
      }
      if ('$regex' in val) {
        const regex = new RegExp(val.$regex, val.$options || 'i');
        if (!regex.test(String(doc[key] || ''))) return false;
        continue;
      }
      if ('$gt' in val) {
        if (!(doc[key] > val.$gt)) return false;
        continue;
      }
      if ('$lt' in val) {
        if (!(doc[key] < val.$lt)) return false;
        continue;
      }
    }

    if (val instanceof RegExp) {
      if (!val.test(String(doc[key] || ''))) return false;
      continue;
    }

    if (Array.isArray(doc[key]) && !Array.isArray(val)) {
      if (!doc[key].includes(val)) return false;
    } else if (doc[key] !== val) {
      // allow string comparisons for _id vs string
      if (key === '_id' && String(doc._id) === String(val)) {
        continue;
      }
      return false;
    }
  }
  return true;
}

class EmbeddedCollection {
  constructor(name) {
    this.name = name;
    if (!memoryDb[name]) {
      memoryDb[name] = [];
    }
  }

  get items() {
    loadDbFromDisk();
    if (!memoryDb[this.name]) {
      memoryDb[this.name] = [];
    }
    return memoryDb[this.name];
  }

  find(query = {}) {
    const list = this.items.filter(doc => matchQuery(doc, query));
    return new QueryChain(list.map(d => JSON.parse(JSON.stringify(d))));
  }

  async findOne(query = {}) {
    const item = this.items.find(doc => matchQuery(doc, query));
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async findById(id) {
    return this.findOne({ _id: String(id) });
  }

  async create(docOrDocs) {
    const now = new Date();
    const isArray = Array.isArray(docOrDocs);
    const docs = isArray ? docOrDocs : [docOrDocs];
    const created = [];

    for (const d of docs) {
      const newDoc = {
        _id: d._id || crypto.randomBytes(12).toString('hex'),
        ...d,
        createdAt: d.createdAt || now,
        updatedAt: d.updatedAt || now
      };
      this.items.push(newDoc);
      created.push(JSON.parse(JSON.stringify(newDoc)));
    }

    persistDb();
    return isArray ? created : created[0];
  }

  async findByIdAndUpdate(id, update = {}, options = { new: true }) {
    return this.updateOne({ _id: String(id) }, update, options);
  }

  async updateOne(query, update = {}, options = {}) {
    const index = this.items.findIndex(doc => matchQuery(doc, query));
    if (index === -1) return null;

    let doc = this.items[index];
    
    // Handle $set, $push, $inc, $pull
    if (update.$set) {
      doc = { ...doc, ...update.$set };
    }
    if (update.$inc) {
      for (const [key, delta] of Object.entries(update.$inc)) {
        doc[key] = (Number(doc[key]) || 0) + delta;
      }
    }
    if (update.$push) {
      for (const [key, val] of Object.entries(update.$push)) {
        if (!Array.isArray(doc[key])) doc[key] = [];
        doc[key].push(val);
      }
    }
    if (update.$pull) {
      for (const [key, val] of Object.entries(update.$pull)) {
        if (Array.isArray(doc[key])) {
          doc[key] = doc[key].filter(v => v !== val && String(v) !== String(val));
        }
      }
    }

    // Direct object update if no operators
    const hasOperators = Object.keys(update).some(k => k.startsWith('$'));
    if (!hasOperators) {
      doc = { ...doc, ...update };
    }

    doc.updatedAt = new Date();
    this.items[index] = doc;
    persistDb();

    return JSON.parse(JSON.stringify(doc));
  }

  async updateMany(query, update = {}) {
    let count = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (matchQuery(this.items[i], query)) {
        await this.updateOne({ _id: this.items[i]._id }, update);
        count++;
      }
    }
    return { modifiedCount: count };
  }

  async findByIdAndDelete(id) {
    const index = this.items.findIndex(doc => String(doc._id) === String(id));
    if (index === -1) return null;
    const deleted = this.items.splice(index, 1)[0];
    persistDb();
    return JSON.parse(JSON.stringify(deleted));
  }

  async deleteOne(query) {
    const index = this.items.findIndex(doc => matchQuery(doc, query));
    if (index === -1) return { deletedCount: 0 };
    this.items.splice(index, 1);
    persistDb();
    return { deletedCount: 1 };
  }

  async deleteMany(query) {
    const initialLen = this.items.length;
    memoryDb[this.name] = this.items.filter(doc => !matchQuery(doc, query));
    const deletedCount = initialLen - memoryDb[this.name].length;
    if (deletedCount > 0) persistDb();
    return { deletedCount };
  }

  async countDocuments(query = {}) {
    return this.items.filter(doc => matchQuery(doc, query)).length;
  }
}

class QueryChain {
  constructor(list) {
    this.list = list;
  }

  sort(sortObj = {}) {
    const entries = Object.entries(sortObj);
    if (!entries.length) return this;
    this.list.sort((a, b) => {
      for (const [key, dir] of entries) {
        const valA = a[key];
        const valB = b[key];
        if (valA < valB) return dir === -1 ? 1 : -1;
        if (valA > valB) return dir === -1 ? -1 : 1;
      }
      return 0;
    });
    return this;
  }

  limit(num) {
    if (num > 0) {
      this.list = this.list.slice(0, num);
    }
    return this;
  }

  skip(num) {
    if (num > 0) {
      this.list = this.list.slice(num);
    }
    return this;
  }

  lean() {
    return this;
  }

  // allows await query
  then(resolve, reject) {
    return Promise.resolve(this.list).then(resolve, reject);
  }

  catch(reject) {
    return Promise.resolve(this.list).catch(reject);
  }

  finally(callback) {
    return Promise.resolve(this.list).finally(callback);
  }
}

module.exports = {
  getCollection: (name) => new EmbeddedCollection(name),
  rawDb: memoryDb,
  persistDb
};
