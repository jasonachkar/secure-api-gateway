/**
 * Test setup and global configuration
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.JWT_ALGORITHM = 'HS256';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-min-256-bits-long-xxxxx';
process.env.COOKIE_SECRET = 'test-cookie-secret-min-32-chars-long';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.ENABLE_SWAGGER = 'false';
process.env.UPSTREAM_REPORTS_URL = 'http://localhost:4000';

// Set reasonable test timeouts
jest.setTimeout(10000);
