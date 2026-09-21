// Vercel Serverless Function entry point
let app;
let bootError = null;

try {
  app = require('../server/index');
} catch (err) {
  bootError = err;
  console.error('[Vercel Serverless Init Error]:', err);
}

module.exports = (req, res) => {
  if (bootError || !app) {
    console.error('[Vercel Invocation Error]:', bootError);
    return res.status(500).json({
      error: 'Backend failed to initialize on Vercel',
      message: bootError ? bootError.message : 'Express app is undefined',
      stack: bootError ? bootError.stack : null
    });
  }
  return app(req, res);
};
