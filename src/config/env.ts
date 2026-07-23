/**
 * Environment variable validation and type-safe configuration
 * Uses Zod for runtime validation to fail fast on misconfiguration
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load .env file early
dotenv.config();

/** Values that must never survive into a production deployment */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'your-cookie-secret-min-32-chars-long-change-in-production',
  'dev-cookie-secret-min-32-chars-long-change-me-xxxxx',
  'dev-cookie-secret-only',
  'your-super-secret-key-min-256-bits-long',
  'your-super-secret-key-min-256-bits-long-change-me',
  'dev-secret-key-for-testing-only-min-256-bits-long-xxxxx',
  'dev-secret-only',
]);

/**
 * Zod schema for environment variables
 * Validates and coerces types at startup - fail fast on misconfiguration
 */
const envSchema = z
  .object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default('0.0.0.0'),

    // Observability
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
    // Managed Redis (e.g. Azure Cache for Redis) is TLS-only by default
    REDIS_TLS: z
      .string()
      .transform((val) => val === 'true')
      .pipe(z.boolean())
      .default('false'),

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
    RATE_LIMIT_APIKEY_MAX: z.coerce.number().int().min(1).default(500),
    RATE_LIMIT_APIKEY_WINDOW: z.coerce.number().int().min(1000).default(60000),

    // Security
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:3000,http://localhost:5173')
      .transform((val) => val.split(',').map((s) => s.trim())),
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
    // Local-dev-only escape hatch: Docker Compose's mock-service resolves to a private
    // Docker-network IP, which the private-IP check correctly blocks by default (that
    // check exists specifically so an *allowlisted* hostname can't be pointed at an
    // internal address via DNS rebinding). docker-compose.yml sets this to true for
    // local dev; superRefine below refuses it outright in production.
    SSRF_ALLOW_PRIVATE_IPS: z
      .string()
      .transform((val) => val === 'true')
      .pipe(z.boolean())
      .default('false'),

    // Circuit breaker (protects upstream calls made via lib/httpClient.ts)
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(5),
    CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().min(1000).default(30000),

    // Features
    ENABLE_SWAGGER: z
      .string()
      .transform((val) => val === 'true')
      .pipe(z.boolean())
      .optional(),
    DEMO_MODE: z
      .string()
      .transform((val) => val === 'true')
      .pipe(z.boolean())
      .default('false'),

    // Ingestion Adapters
    CLOUDWATCH_LOG_GROUP: z.string().optional(),
    GCP_LOGGING_PROJECT: z.string().optional(),
    AZURE_SENTINEL_WORKSPACE: z.string().optional(),

    // Request Limits
    BODY_LIMIT: z.coerce.number().int().min(1024).default(1048576), // 1MB default
    REQUEST_TIMEOUT: z.coerce.number().int().min(1000).max(120000).default(30000), // ms
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') {
      return;
    }

    // Fail fast on placeholder/example secrets in production
    if (KNOWN_PLACEHOLDER_SECRETS.has(data.COOKIE_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECRET'],
        message: 'COOKIE_SECRET is a known placeholder value and must be set to a unique secret in production',
      });
    }
    if (data.JWT_SECRET && KNOWN_PLACEHOLDER_SECRETS.has(data.JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET is a known placeholder value and must be set to a unique secret in production',
      });
    }

    // Redis must be authenticated in production
    if (!data.REDIS_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_PASSWORD'],
        message: 'REDIS_PASSWORD is required in production (Redis holds tokens, rate-limit, and audit state)',
      });
    }

    // CORS must never wildcard in production
    if (data.CORS_ORIGIN.some((origin) => origin === '*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGIN'],
        message: 'CORS_ORIGIN must be an explicit origin allowlist in production, not "*"',
      });
    }

    // Swagger UI leaks API surface details; must be explicitly opted into in production
    if (data.ENABLE_SWAGGER === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENABLE_SWAGGER'],
        message: 'ENABLE_SWAGGER should not be enabled in production',
      });
    }

    // The private-IP bypass exists only to make the Docker Compose demo topology work;
    // it must never weaken SSRF protection in a real deployment
    if (data.SSRF_ALLOW_PRIVATE_IPS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SSRF_ALLOW_PRIVATE_IPS'],
        message: 'SSRF_ALLOW_PRIVATE_IPS must not be enabled in production - it is a local-dev-only escape hatch',
      });
    }
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

const isDevelopment = validatedEnv.NODE_ENV === 'development';
const isProduction = validatedEnv.NODE_ENV === 'production';
const isTest = validatedEnv.NODE_ENV === 'test';

// Swagger defaults to on in dev/test and off in production unless explicitly overridden
const enableSwagger = validatedEnv.ENABLE_SWAGGER ?? !isProduction;

/**
 * Exported configuration object, grouped by concern (server, auth, redis, security, upstream,
 * observability, ...) so callers only need to reason about the slice they use. Strongly typed
 * and validated at startup - fails fast (see superRefine above) rather than booting with an
 * insecure or broken production configuration.
 */
export const env = {
  server: {
    nodeEnv: validatedEnv.NODE_ENV,
    isDevelopment,
    isProduction,
    isTest,
    port: validatedEnv.PORT,
    host: validatedEnv.HOST,
    bodyLimit: validatedEnv.BODY_LIMIT,
    requestTimeout: validatedEnv.REQUEST_TIMEOUT,
  },
  observability: {
    logLevel: validatedEnv.LOG_LEVEL,
    logPretty: validatedEnv.LOG_PRETTY,
  },
  redis: {
    host: validatedEnv.REDIS_HOST,
    port: validatedEnv.REDIS_PORT,
    password: validatedEnv.REDIS_PASSWORD,
    db: validatedEnv.REDIS_DB,
    tls: validatedEnv.REDIS_TLS,
  },
  auth: {
    jwt: {
      algorithm: validatedEnv.JWT_ALGORITHM,
      privateKey: jwtKeys.privateKey,
      publicKey: jwtKeys.publicKey,
      secret: validatedEnv.JWT_SECRET,
      accessTokenExpiresIn: validatedEnv.JWT_ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresIn: validatedEnv.JWT_REFRESH_TOKEN_EXPIRES_IN,
    },
    bcryptRounds: validatedEnv.BCRYPT_ROUNDS,
    maxLoginAttempts: validatedEnv.MAX_LOGIN_ATTEMPTS,
    lockoutDurationMs: validatedEnv.LOCKOUT_DURATION,
  },
  security: {
    corsOrigins: validatedEnv.CORS_ORIGIN,
    cookieSecret: validatedEnv.COOKIE_SECRET,
  },
  rateLimit: {
    globalMax: validatedEnv.RATE_LIMIT_GLOBAL_MAX,
    globalWindowMs: validatedEnv.RATE_LIMIT_GLOBAL_WINDOW,
    authMax: validatedEnv.RATE_LIMIT_AUTH_MAX,
    authWindowMs: validatedEnv.RATE_LIMIT_AUTH_WINDOW,
    userMax: validatedEnv.RATE_LIMIT_USER_MAX,
    userWindowMs: validatedEnv.RATE_LIMIT_USER_WINDOW,
    apiKeyMax: validatedEnv.RATE_LIMIT_APIKEY_MAX,
    apiKeyWindowMs: validatedEnv.RATE_LIMIT_APIKEY_WINDOW,
  },
  upstream: {
    reportsUrl: validatedEnv.UPSTREAM_REPORTS_URL,
    timeoutMs: validatedEnv.UPSTREAM_TIMEOUT,
    retryAttempts: validatedEnv.UPSTREAM_RETRY_ATTEMPTS,
    allowedHosts: validatedEnv.ALLOWED_UPSTREAM_HOSTS,
    allowPrivateIps: validatedEnv.SSRF_ALLOW_PRIVATE_IPS,
    circuitBreaker: {
      failureThreshold: validatedEnv.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      cooldownMs: validatedEnv.CIRCUIT_BREAKER_COOLDOWN_MS,
    },
  },
  features: {
    enableSwagger,
    demoMode: validatedEnv.DEMO_MODE,
  },
  ingestion: {
    cloudwatchLogGroup: validatedEnv.CLOUDWATCH_LOG_GROUP,
    gcpLoggingProject: validatedEnv.GCP_LOGGING_PROJECT,
    azureSentinelWorkspace: validatedEnv.AZURE_SENTINEL_WORKSPACE,
  },
  storage: {
    postgresUrl: validatedEnv.POSTGRES_URL,
  },
} as const;

export type Env = typeof env;
