const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { seedDatabase } = require('./utils/seed');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const reposRoutes = require('./routes/repos');
const filesRoutes = require('./routes/files');
const branchesRoutes = require('./routes/branches');
const commitsRoutes = require('./routes/commits');
const issuesRoutes = require('./routes/issues');
const pullRequestsRoutes = require('./routes/pullRequests');
const searchRoutes = require('./routes/search');
const notificationsRoutes = require('./routes/notifications');
const { apiRouter: runnerApiRouter, serveWebProject } = require('./routes/runner');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Live Web Project Runner Route: /runner/:owner/:repo/:branch/*
const runnerProxyRouter = express.Router({ mergeParams: true });
runnerProxyRouter.use('/:owner/:repo/:branch', serveWebProject);
app.use('/runner', runnerProxyRouter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/repos', reposRoutes);
app.use('/api/repos', branchesRoutes);
app.use('/api/repos', commitsRoutes);
app.use('/api/repos', issuesRoutes);
app.use('/api/repos', pullRequestsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/runner', runnerApiRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// Serve frontend build if exists
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  // If request starts with /api or /runner, return 404
  if (req.path.startsWith('/api') || req.path.startsWith('/runner')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  const indexHtml = path.join(clientDistPath, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      res.status(200).send('GitHub Clone Server running on port ' + PORT + '. Vite dev server is on port 5173 or run npm run build in client.');
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Ensure Database is connected before processing requests (essential for Serverless / Vercel)
let dbInitPromise = null;
app.use(async (req, res, next) => {
  if (!dbInitPromise) {
    dbInitPromise = connectDB().catch(err => {
      console.error('[DB Middleware Error]', err.message);
      dbInitPromise = null;
    });
  }
  await dbInitPromise;
  next();
});

// Start Server for local and persistent environments
async function startServer() {
  await connectDB();
  await seedDatabase();

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  🚀 GitHub Code Hosting Platform Server Online`);
    console.log(`  📡 Port: http://localhost:${PORT}`);
    console.log(`  ⚡ Live Runner Base: http://localhost:${PORT}/runner`);
    console.log(`====================================================`);
  });
}

if (require.main === module && !process.env.VERCEL) {
  startServer();
}

module.exports = app;
module.exports.connectDB = connectDB;

