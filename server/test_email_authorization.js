const assert = require('assert');

const BASE_URL = 'http://localhost:5000/api';

async function testEmailAuthorization() {
  console.log('====================================================');
  console.log('🧪 Testing 6-Digit Email Authorization (Signup & Login 2FA)');
  console.log('====================================================');

  const testUser = `auth_test_${Date.now().toString().slice(-6)}`;
  const testEmail = `${testUser}@example.org`;
  const testPassword = 'Password123!Secure';

  // 1. Test Sign Up: Initiating registration
  console.log(`[1] Submitting signup for ${testUser}...`);
  const signupInitRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUser,
      name: 'Email Auth Bot',
      email: testEmail,
      password: testPassword
    })
  });
  const signupInitData = await signupInitRes.json();
  assert.strictEqual(signupInitRes.status, 200, `Signup init status: ${signupInitRes.status}`);
  assert.strictEqual(signupInitData.requiresVerification, true, 'Requires verification should be true');
  assert.strictEqual(signupInitData.type, 'signup');
  assert.ok(signupInitData.devCode && /^\d{6}$/.test(signupInitData.devCode), 'Generated a valid 6-digit code');
  console.log(`  ✅ PASS: Signup request generated 6-digit verification code: ${signupInitData.devCode}`);

  // 2. Test Sign Up: Invalid code rejection
  console.log('[2] Testing invalid signup code rejection...');
  const badSignupRes = await fetch(`${BASE_URL}/auth/register-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: '000000'
    })
  });
  assert.strictEqual(badSignupRes.status, 400, 'Invalid code should return 400');
  console.log('  ✅ PASS: Invalid code correctly rejected');

  // 3. Test Sign Up: Verify with correct 6-digit code
  console.log('[3] Submitting correct 6-digit code to complete registration...');
  const signupVerifyRes = await fetch(`${BASE_URL}/auth/register-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: signupInitData.devCode
    })
  });
  const signupVerifyData = await signupVerifyRes.json();
  assert.strictEqual(signupVerifyRes.status, 201, `Signup verify status: ${signupVerifyRes.status}`);
  assert.ok(signupVerifyData.token, 'Session JWT token issued upon email verification');
  assert.strictEqual(signupVerifyData.user.username, testUser);
  assert.strictEqual(signupVerifyData.user.email, testEmail);
  console.log(`  ✅ PASS: Account verified & created! User: ${signupVerifyData.user.username}`);

  // 4. Test Login: Initiating sign-in with username/password
  console.log('[4] Submitting sign-in credentials to trigger login 2FA code...');
  const loginInitRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login: testUser,
      password: testPassword
    })
  });
  const loginInitData = await loginInitRes.json();
  assert.strictEqual(loginInitRes.status, 200);
  assert.strictEqual(loginInitData.requiresVerification, true);
  assert.strictEqual(loginInitData.type, 'login');
  assert.ok(loginInitData.maskedEmail.includes('*'), 'Email is properly masked for security');
  assert.ok(loginInitData.devCode && /^\d{6}$/.test(loginInitData.devCode), 'Generated valid 6-digit 2FA login code');
  console.log(`  ✅ PASS: Login triggered 2FA! Code sent to ${loginInitData.maskedEmail}: ${loginInitData.devCode}`);

  // 5. Test Login: Resend code
  console.log('[5] Testing resend code feature...');
  const resendRes = await fetch(`${BASE_URL}/auth/resend-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      type: 'login'
    })
  });
  const resendData = await resendRes.json();
  assert.strictEqual(resendRes.status, 200);
  assert.ok(resendData.devCode && /^\d{6}$/.test(resendData.devCode));
  console.log(`  ✅ PASS: Resend code succeeded with new code: ${resendData.devCode}`);

  // 6. Test Login: Complete verification with new 6-digit code
  console.log('[6] Submitting 6-digit code to complete login...');
  const loginVerifyRes = await fetch(`${BASE_URL}/auth/login-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: resendData.devCode
    })
  });
  const loginVerifyData = await loginVerifyRes.json();
  assert.strictEqual(loginVerifyRes.status, 200);
  assert.ok(loginVerifyData.token, 'Issued JWT session token');
  assert.strictEqual(loginVerifyData.user.username, testUser);
  console.log(`  ✅ PASS: 2FA Login verified! Session active for ${loginVerifyData.user.username}`);

  // 7. Test Auth with issued token
  const meRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${loginVerifyData.token}` }
  });
  const meData = await meRes.json();
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meData.user.username, testUser);
  console.log('  ✅ PASS: Protected endpoint authenticated with issued session');

  console.log('====================================================');
  console.log('🎉 ALL 6-DIGIT EMAIL AUTHORIZATION TESTS PASSED CLEANLY!');
  console.log('====================================================');
}

testEmailAuthorization().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
