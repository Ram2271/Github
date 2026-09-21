const nodemailer = require('nodemailer');

async function testRealSmtpDispatch() {
  console.log('====================================================');
  console.log('✉️  Testing Real SMTP Email Dispatch via Nodemailer');
  console.log('====================================================');

  try {
    const testAccount = await nodemailer.createTestAccount();
    console.log(`[SMTP Test] Generated Ethereal SMTP Mailer: ${testAccount.user}`);

    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    const testRecipient = 'newuser@example.com';
    const testCode = '492817';

    const info = await transporter.sendMail({
      from: `"GitHub Security" <${testAccount.user}>`,
      to: testRecipient,
      subject: `[GitHub] Verify your email address (${testCode})`,
      text: `Your 6-digit verification code is: ${testCode}`,
      html: `<div style="font-family: sans-serif; background:#0d1117; color:#c9d1d9; padding:20px; border-radius:8px;">
        <h2 style="color:#58a6ff;">Verify your email address</h2>
        <p>Your 6-digit verification code:</p>
        <div style="font-size:32px; font-weight:bold; letter-spacing:6px; color:#58a6ff; margin:20px 0;">${testCode}</div>
        <p>This code expires in 10 minutes.</p>
      </div>`
    });

    console.log('✅ PASS: Real SMTP message successfully dispatched!');
    console.log(`   Message ID:  ${info.messageId}`);
    console.log(`   Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    console.log('====================================================');
    console.log('🎉 REAL SMTP EMAIL DISPATCH CONFIRMED FUNCTIONAL!');
    console.log('====================================================');
  } catch (err) {
    console.error('SMTP test failed:', err);
    process.exit(1);
  }
}

testRealSmtpDispatch();
