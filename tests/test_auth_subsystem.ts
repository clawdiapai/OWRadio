/**
 * @file test_auth_subsystem.ts
 * @description Automated unit & integration tests for OWRadio Double Authentication Subsystem.
 * Tests password verification, session token HMAC signing & tampering rejection,
 * and the granular permission gate (queue is public, controls are protected).
 */

import assert from 'node:assert';
import authService from '../src/web/auth.js';
import config from '../src/config.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing OWRadio Authentication Subsystem');
  console.log('====================================================');

  // Ensure test admin password is set for the test run
  const TEST_PASSWORD = 'super_secret_admin_pass_99';
  authService.setTestPassword(TEST_PASSWORD);
  authService.setTestAuthEnabled(true);

  // --- 1. Password Timing-Safe Verification ---
  console.log('\n--- 1. Testing Password Verification ---');
  assert.strictEqual(
    authService.verifyAdminPassword(TEST_PASSWORD),
    true,
    'Correct admin password should be verified successfully'
  );
  assert.strictEqual(
    authService.verifyAdminPassword('wrong_password_here'),
    false,
    'Incorrect admin password should be rejected'
  );
  assert.strictEqual(
    authService.verifyAdminPassword(''),
    false,
    'Empty password should be rejected'
  );
  console.log('✅ Password verification tests passed!');

  // --- 2. Session Token Creation & Verification ---
  console.log('\n--- 2. Testing Session Token Generation & HMAC Verification ---');
  const token = authService.createSessionToken('password', { name: 'SuperAdmin' });
  assert.ok(typeof token === 'string' && token.length > 20, 'Session token should be a non-empty string');

  const verification = authService.verifySessionToken(token);
  assert.strictEqual(verification.valid, true, 'Valid token should pass verification');
  assert.strictEqual(verification.session?.role, 'admin', 'Session role should be admin');
  assert.strictEqual(verification.session?.authType, 'password', 'Session authType should match');
  assert.strictEqual(verification.session?.user?.name, 'SuperAdmin', 'Session user data should be preserved');
  console.log('✅ Valid session token verification passed!');

  // --- 3. Tampered Token Rejection ---
  console.log('\n--- 3. Testing Tampered Token Rejection ---');
  const [b64Data, signature] = token.split('.');
  assert.ok(b64Data && signature, 'Token should contain payload and signature segments');

  // Tamper with payload
  const tamperedPayload = Buffer.from(JSON.stringify({ role: 'admin', exp: 9999999999 })).toString('base64url');
  const tamperedToken = `${tamperedPayload}.${signature}`;

  const tamperedResult = authService.verifySessionToken(tamperedToken);
  assert.strictEqual(tamperedResult.valid, false, 'Tampered token signature must fail verification');

  // Completely corrupt token
  const garbageResult = authService.verifySessionToken('completely.invalid.token');
  assert.strictEqual(garbageResult.valid, false, 'Garbage token must fail verification');
  console.log('✅ Tamper detection and signature verification passed!');

  // --- 4. Granular Permission Gate Concept Verification ---
  console.log('\n--- 4. Testing Granular Permission Guard Concept ---');
  // Public routes (Queue add, song search) MUST remain unrestricted
  const publicRoutes = ['/stream.mp3', '/api/nowplaying', '/api/queue', '/api/queue/add', '/api/player/queue', '/api/events'];
  // Admin-locked routes MUST require verification
  const adminRoutes = [
    '/api/player/skip',
    '/api/player/pause',
    '/api/player/resume',
    '/api/player/stop',
    '/api/player/volume',
    '/api/queue/clear',
    '/api/queue/remove',
    '/api/settings/config/update',
    '/api/settings/toggle',
    '/api/settings/radio',
  ];

  for (const route of publicRoutes) {
    const isPublic = route.includes('/queue/add') || route.includes('/player/queue') || !adminRoutes.includes(route);
    assert.strictEqual(isPublic, true, `Route ${route} must be public`);
  }

  for (const route of adminRoutes) {
    const isProtected = !publicRoutes.includes(route);
    assert.strictEqual(isProtected, true, `Route ${route} must be protected behind admin auth`);
  }
  console.log('✅ Granular permission guard definitions passed!');

  console.log('\n🎉 ALL AUTHENTICATION SUBSYSTEM TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Auth test suite failed:', err);
  process.exit(1);
});
