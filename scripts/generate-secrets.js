#!/usr/bin/env node
/**
 * Generate secure secrets for deployment
 * Usage: node scripts/generate-secrets.js
 */

const crypto = require('crypto');

console.log('\n🔐 Generating secure secrets for deployment...\n');

// Generate JWT Secret (256 bits = 32 bytes = 64 hex chars)
const jwtSecret = crypto.randomBytes(32).toString('hex');
console.log('JWT_SECRET=' + jwtSecret);
console.log('  (Use this for JWT_ALGORITHM=HS256)\n');

// Generate Cookie Secret (256 bits)
const cookieSecret = crypto.randomBytes(32).toString('hex');
console.log('COOKIE_SECRET=' + cookieSecret);
console.log('  (Minimum 32 characters required)\n');

// Generate additional secrets if needed
const apiKey = crypto.randomBytes(32).toString('hex');
console.log('API_KEY=' + apiKey);
console.log('  (Optional: for API key authentication)\n');

console.log('✅ Copy these values to your deployment platform\'s environment variables\n');
console.log('⚠️  Keep these secrets secure! Never commit them to version control.\n');

