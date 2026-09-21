const nodemailer = require('nodemailer');
const crypto = require('crypto');

/**
 * Clean and format Google App Password (handles spaces commonly copied from Google security panel)
 */
function getEmailCredentials() {
  const user = (process.env.GMAIL_USER || process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const rawPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
  // Google App Passwords are 16 lowercase characters, often displayed as 4 groups of 4 with spaces
  const pass = rawPass.replace(/\s+/g, '');
  return { user, pass };
}

/**
 * Initialize or get Nodemailer Transporter configured for Gmail / SMTP
 */
function getTransporter() {
  const { user, pass } = getEmailCredentials();

  if (!user || !pass) {
    return null;
  }

  // If a custom SMTP host is set (non-gmail), use custom host/port
  if (process.env.SMTP_HOST && !process.env.SMTP_HOST.includes('gmail')) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  // Default: Gmail service transport
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

/**
 * Check if Gmail / SMTP is configured
 */
function isEmailConfigured() {
  const { user, pass } = getEmailCredentials();
  return Boolean(user && pass);
}

// Startup status check
if (isEmailConfigured()) {
  const { user } = getEmailCredentials();
  console.log(`[EmailService] ✅ Developer Gmail OTP service configured for: ${user}`);
} else {
  console.log('[EmailService] ⚠️ Notice: GMAIL_USER and GMAIL_APP_PASSWORD are not set in server/.env.');
  console.log('[EmailService] ℹ️ To enable live email delivery, add GMAIL_USER and GMAIL_APP_PASSWORD to server/.env.');
}

/**
 * Generate a cryptographically secure 6-digit verification OTP
 */
function generate6DigitCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Send 6-digit verification code email strictly to the user's entered email
 * @param {Object} options
 * @param {string} options.to - User's entered email address
 * @param {string} options.code - 6-digit OTP code
 * @param {string} options.type - 'signup' | 'login'
 * @param {string} [options.username] - Optional username
 */
async function sendVerificationEmail({ to, code, type = 'login', username = '' }) {
  const cleanTo = (to || '').trim().toLowerCase();
  if (!cleanTo) {
    throw new Error('Recipient email address is required.');
  }

  const { user } = getEmailCredentials();
  const transporter = getTransporter();

  if (!transporter) {
    throw new Error(
      'Email delivery is currently not configured on the server. The developer must configure GMAIL_USER and GMAIL_APP_PASSWORD in server/.env to send real 6-digit OTP codes.'
    );
  }

  const isSignUp = type === 'signup';
  const subject = isSignUp
    ? `[GitHub] Verify your email address (${code})`
    : `[GitHub] Your 6-digit authentication code: ${code}`;

  const title = isSignUp ? 'Verify your email address' : 'Two-Factor Authentication Code';
  const description = isSignUp
    ? 'Welcome to GitHub! To complete creating your account, please enter this 6-digit verification code:'
    : 'A sign-in request was made for your account. Enter the following 6-digit verification code to complete sign-in:';

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #0d1117; color: #c9d1d9; margin: 0; padding: 40px 20px; }
      .container { max-width: 520px; margin: 0 auto; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 32px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
      .logo { text-align: center; margin-bottom: 24px; }
      .logo svg { fill: #f0f6fc; }
      h1 { color: #f0f6fc; font-size: 20px; font-weight: 600; margin-top: 0; text-align: center; }
      p { font-size: 14px; line-height: 1.6; color: #8b949e; }
      .code-container { text-align: center; margin: 28px 0; background: #0d1117; border: 1px dashed #30363d; border-radius: 8px; padding: 20px; }
      .code { font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #58a6ff; }
      .notice { font-size: 12px; color: #8b949e; line-height: 1.5; margin-top: 20px; }
      .footer { margin-top: 32px; font-size: 11px; color: #6e7681; text-align: center; border-top: 1px solid #21262d; padding-top: 16px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo">
        <svg height="40" viewBox="0 0 16 16" width="40" fill="#f0f6fc">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
        </svg>
      </div>
      <h1>${title}</h1>
      <p>Hello${username ? ' <strong>' + username + '</strong>' : ''},</p>
      <p>${description}</p>
      <div class="code-container">
        <div class="code">${code}</div>
      </div>
      <p class="notice">
        This verification code expires in <strong>10 minutes</strong>.<br>
        If you did not initiate this request, please change your password immediately.
      </p>
      <div class="footer">
        Sent by GitHub Code Hosting Platform via Developer Gmail (${user}) &bull; Automated Security Service
      </div>
    </div>
  </body>
  </html>
  `;

  const text = `${title}\n\nHello${username ? ' ' + username : ''},\n\n${description}\n\nYour 6-digit code: ${code}\n\nThis code expires in 10 minutes.\n\nSent by GitHub Code Hosting Platform.`;

  try {
    const info = await transporter.sendMail({
      from: `"GitHub Security" <${user}>`,
      to: cleanTo,
      subject,
      text,
      html
    });

    console.log(`[EmailService] ✉️  OTP successfully delivered to ${cleanTo} via Gmail (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EmailService] ❌ Failed to dispatch email to ${cleanTo}:`, err.message);
    throw new Error(`Failed to send verification email to ${cleanTo}: ${err.message}`);
  }
}

module.exports = {
  generate6DigitCode,
  sendVerificationEmail,
  isEmailConfigured,
  getEmailCredentials
};
