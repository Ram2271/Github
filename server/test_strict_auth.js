const http = require('http');
const BASE_URL = 'http://localhost:5000';

async function req(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { ...options.headers };

    let bodyData = options.body;
    if (bodyData && typeof bodyData === 'object' && !(bodyData instanceof Buffer)) {
      headers['Content-Type'] = 'application/json';
      bodyData = JSON.stringify(bodyData);
    }

    const clientReq = http.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });

    clientReq.on('error', reject);
    if (bodyData) clientReq.write(bodyData);
    clientReq.end();
  });
}

async function runStrictAuthTests() {
  console.log('====================================================');
  console.log('🔒 Testing Strict Out-of-Band Email Authorization System');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Check server health
    const health = await req('/api/health');
    assert(health.status === 200, 'Server health returns 200 online');

    // 2. Strict Protection: Registration blocked without configured Gmail
    console.log('[1] Testing unconfigured Gmail rejection...');
    const unconfigRes = await req('/api/auth/register', {
      method: 'POST',
      body: {
        username: 'unconfig_user',
        email: 'unconfig@example.com',
        password: 'Password123!'
      }
    });
    assert(
      unconfigRes.status === 500 &&
      unconfigRes.data.error &&
      unconfigRes.data.error.includes('GMAIL_USER and GMAIL_APP_PASSWORD'),
      'Registration strictly blocked when developer Gmail is not configured in .env'
    );
    assert(
      !unconfigRes.data.devCode && !unconfigRes.data.code,
      'No verification code leaked in response payload'
    );

    // 3. Strict Protection: Login blocked without configured Gmail
    console.log('[2] Testing login rejection when 2FA email cannot be sent...');
    const loginRes = await req('/api/auth/login', {
      method: 'POST',
      body: {
        login: 'developer',
        password: 'password123'
      }
    });
    assert(
      loginRes.status === 500 &&
      loginRes.data.error &&
      loginRes.data.error.includes('GMAIL_USER and GMAIL_APP_PASSWORD'),
      'Login 2FA strictly blocked when developer Gmail is not configured in .env'
    );
    assert(
      !loginRes.data.devCode && !loginRes.data.token,
      'No JWT session or devCode issued on unverified login attempt'
    );

    // 4. Test Direct VerificationCode Model & Brute-Force Rate Limiter
    console.log('[3] Testing VerificationCode security & brute-force attempt lockout...');
    const VerificationCode = require('./models/VerificationCode');
    const testEmail = 'security_test@example.com';
    const testCode = '839210';

    await VerificationCode.deleteMany({ email: testEmail, type: 'signup' });
    await VerificationCode.create({
      email: testEmail,
      code: testCode,
      type: 'signup',
      attempts: 0,
      payload: {
        username: 'security_test_user',
        email: testEmail,
        password: 'hashed_password_placeholder',
        name: 'Security Tester'
      },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Submit wrong codes and verify remaining attempts counter
    const wrong1 = await req('/api/auth/register-verify', {
      method: 'POST',
      body: { email: testEmail, code: '000000' }
    });
    assert(
      wrong1.status === 400 && wrong1.data.error.includes('4 attempt(s) remaining'),
      'Failed attempt 1 tracked (4 attempts remaining)'
    );

    // Exhaust attempts
    for (let i = 0; i < 4; i++) {
      await req('/api/auth/register-verify', {
        method: 'POST',
        body: { email: testEmail, code: `11111${i}` }
      });
    }

    // Attempt 6 should be rejected with code invalidated
    const lockoutRes = await req('/api/auth/register-verify', {
      method: 'POST',
      body: { email: testEmail, code: testCode }
    });
    assert(
      lockoutRes.status === 400 &&
      (lockoutRes.data.error.includes('invalidated') || lockoutRes.data.error.includes('expired') || lockoutRes.data.error.includes('No pending registration')),
      'Brute-force lockout: Code invalidated after 5 failed attempts'
    );

    // Clean up
    await VerificationCode.deleteMany({ email: testEmail });

    console.log('====================================================');
    console.log(`Summary: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('🎉 ALL STRICT EMAIL AUTHORIZATION SECURITY TESTS PASSED!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runStrictAuthTests();
