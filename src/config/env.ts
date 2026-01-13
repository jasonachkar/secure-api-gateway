/**
 * Environment variable validation and type-safe configuration
 * Uses Zod for runtime validation to fail fast on misconfiguration
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load .env file early
dotenv.config();

/**
 * Zod schema for environment variables
 * Validates and coerces types at startup - fail fast on misconfiguration
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z
    .string()
    .transform((val) => val === 'true')
    .pipe(z.boolean())
    .default('true'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),

  // Postgres (optional for ingestion storage)
  POSTGRES_URL: z.string().optional(),

  // JWT
  JWT_ALGORITHM: z.enum(['RS256', 'HS256']).default('RS256'),
  JWT_PRIVATE_KEY: z.string().optional(), // File path for RS256
  JWT_PUBLIC_KEY: z.string().optional(), // File path for RS256
  JWT_SECRET: z.string().optional(), // For HS256
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Rate Limiting
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_GLOBAL_WINDOW: z.coerce.number().int().min(1000).default(60000), // ms
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_AUTH_WINDOW: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_USER_MAX: z.coerce.number().int().min(1).default(200),
  RATE_LIMIT_USER_WINDOW: z.coerce.number().int().min(1000).default(60000),

  // Security
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://localhost:5173')
    .transform((val) => val.split(',').map(s => s.trim())),
  COOKIE_SECRET: z.string().min(32),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Account Security
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  LOCKOUT_DURATION: z.coerce.number().int().min(60000).default(900000), // ms (15min default)

  // Upstream Services
  UPSTREAM_REPORTS_URL: z.string().url().default('http://mock-service:4000'),
  UPSTREAM_TIMEOUT: z.coerce.number().int().min(1000).max(30000).default(5000),
  UPSTREAM_RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(2),

  // SSRF Protection
  ALLOWED_UPSTREAM_HOSTS: z
    .string()
    .default('mock-service,api.example.com')
    .transform((val) => val.split(',')),

  // Features
  ENABLE_SWAGGER: z
    .string()
    .transform((val) => val === 'true')
    .pipe(z.boolean())
    .default('true'),

  // Ingestion Adapters
  CLOUDWATCH_LOG_GROUP: z.string().optional(),
  GCP_LOGGING_PROJECT: z.string().optional(),
  AZURE_SENTINEL_WORKSPACE: z.string().optional(),

  // Request Limits
  BODY_LIMIT: z.coerce.number().int().min(1024).default(1048576), // 1MB default
  REQUEST_TIMEOUT: z.coerce.number().int().min(1000).max(120000).default(30000), // ms
});

type EnvSchema = z.infer<typeof envSchema>;

/**
 * Validated environment configuration
 * Throws on invalid configuration to prevent running with bad config
 */
let validatedEnv: EnvSchema;

try {
  validatedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment configuration:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

/**
 * Load JWT keys from filesystem for RS256
 * Only required when using RS256 algorithm
 */
function loadJWTKeys(): { privateKey?: string; publicKey?: string } {
  if (validatedEnv.JWT_ALGORITHM === 'HS256') {
    if (!validatedEnv.JWT_SECRET) {
      console.error('❌ JWT_SECRET is required when using HS256');
      process.exit(1);
    }
    return {};
  }

  // RS256 requires key files
  if (!validatedEnv.JWT_PRIVATE_KEY || !validatedEnv.JWT_PUBLIC_KEY) {
    console.error('❌ JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required when using RS256');
    console.error('   Generate keys with:');
    console.error('   openssl genrsa -out keys/private.pem 2048');
    console.error('   openssl rsa -in keys/private.pem -pubout -out keys/public.pem');
    process.exit(1);
  }

  try {
    const privateKey = readFileSync(validatedEnv.JWT_PRIVATE_KEY, 'utf8');
    const publicKey = readFileSync(validatedEnv.JWT_PUBLIC_KEY, 'utf8');
    return { privateKey, publicKey };
  } catch (error) {
    console.error('❌ Failed to read JWT key files:', error);
    process.exit(1);
  }
}

const jwtKeys = loadJWTKeys();

/**
 * Exported configuration object
 * Strongly typed and validated at startup
 */
export const env = {
  ...validatedEnv,
  isDevelopment: validatedEnv.NODE_ENV === 'development',
  isProduction: validatedEnv.NODE_ENV === 'production',
  isTest: validatedEnv.NODE_ENV === 'test',
  jwt: {
    algorithm: validatedEnv.JWT_ALGORITHM,
    privateKey: jwtKeys.privateKey,
    publicKey: jwtKeys.publicKey,
    secret: validatedEnv.JWT_SECRET,
    accessTokenExpiresIn: validatedEnv.JWT_ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresIn: validatedEnv.JWT_REFRESH_TOKEN_EXPIRES_IN,
  },
} as const;

export type Env = typeof env;
