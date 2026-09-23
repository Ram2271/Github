/**
 * Helper Script to Generate Google Drive OAuth2 Refresh Token
 * 
 * Usage:
 *   node server/scripts/get_gdrive_tokens.js <CLIENT_ID> <CLIENT_SECRET>
 */
const http = require('http');
const url = require('url');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const clientId = process.argv[2] || process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.argv[3] || process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.log(`
====================================================================
🔑 GOOGLE DRIVE OAUTH2 REFRESH TOKEN GENERATOR
====================================================================
To use your personal Google Drive (15 GB free storage), you need:
1. Google Client ID
2. Google Client Secret

Steps to get them (Takes 1 minute in Google Cloud Console):
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click "+ CREATE CREDENTIALS" -> "OAuth client ID".
   (If asked to configure OAuth consent screen: choose "External", 
    enter App name: "GitHub Storage", your email, and click Save).
3. Application Type: Select "Web application".
4. Name: "GitHub Storage Web Client".
5. Under "Authorized redirect URIs", click "+ ADD URI" and add:
   http://localhost:3000/oauth2callback
6. Click "CREATE" and copy your Client ID and Client Secret.

Then run:
  node server/scripts/get_gdrive_tokens.js <CLIENT_ID> <CLIENT_SECRET>
====================================================================
`);
  process.exit(1);
}

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive']
});

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = url.parse(req.url, true);
    if (reqUrl.pathname === '/oauth2callback') {
      const code = reqUrl.query.code;
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Error: No authorization code received.</h1>');
        return;
      }

      const { tokens } = await oauth2Client.getToken(code);
      const refreshToken = tokens.refresh_token;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #2da44e;">✅ Google Drive Authorized Successfully!</h2>
          <p>Your OAuth2 tokens have been generated and saved to your <code>server/.env</code> file.</p>
          <p>You can close this browser window and return to your terminal.</p>
        </div>
      `);

      console.log('\n====================================================');
      console.log('🎉 GOOGLE DRIVE AUTHORIZATION SUCCESSFUL!');
      console.log('====================================================');
      console.log('Refresh Token:', refreshToken);

      // Automatically update server/.env
      const envPath = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Add or replace OAuth2 keys
        if (!envContent.includes('GOOGLE_CLIENT_ID=')) {
          envContent += `\nGOOGLE_CLIENT_ID=${clientId}`;
        } else {
          envContent = envContent.replace(/GOOGLE_CLIENT_ID=.*/g, `GOOGLE_CLIENT_ID=${clientId}`);
        }

        if (!envContent.includes('GOOGLE_CLIENT_SECRET=')) {
          envContent += `\nGOOGLE_CLIENT_SECRET=${clientSecret}`;
        } else {
          envContent = envContent.replace(/GOOGLE_CLIENT_SECRET=.*/g, `GOOGLE_CLIENT_SECRET=${clientSecret}`);
        }

        if (!envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
          envContent += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}`;
        } else {
          envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
        }

        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log('✅ Automatically updated server/.env with your Google OAuth2 credentials!');
      }

      console.log('====================================================\n');
      server.close();
      process.exit(0);
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Error: ${err.message}</h1>`);
    console.error('OAuth Error:', err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\n====================================================');
  console.log('🌐 Opening browser to authorize Google Drive...');
  console.log(`If browser doesn't open automatically, open this URL:\n${authUrl}`);
  console.log('====================================================\n');

  // Try to open URL in browser
  const startCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
  require('child_process').exec(`${startCmd} "${authUrl}"`);
});
