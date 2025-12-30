/**
 * Request validation middleware using Zod
 * Provides type-safe validation with sanitization
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors.js';

/**
 * Validation target (which part of request to validate)
 */
export type ValidationTarget = 'body' | 'query' | 'params' | 'headers';

/**
 * Format Zod errors into user-friendly structure
 * @param error - Zod validation error
 * @returns Formatted error details
 */
function formatZodError(error: ZodError) {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
}

/**
 * Create validation middleware for a specific schema and target
 * Strips unknown keys by default for security (prevents prototype pollution)
 *
 * @param schema - Zod schema to validate against
 * @param target - Which part of request to validate
 * @returns Fastify preHandler hook
 *
 * @example
 * app.post('/users', {
 *   preHandler: validate(createUserSchema, 'body')
 * }, handler);
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate and parse (Zod strips unknown keys by default with .strict() not used)
      const data = await schema.parseAsync(request[target]);

      // Replace request data with validated/sanitized version
      // This ensures only validated fields are present (strips extra fields)
      (request as any)[target] = data;
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = formatZodError(error);
        throw new ValidationError('Validation failed', formattedErrors);
      }
      throw error;
    }
  };
}

/**
 * Create validation middleware for multiple targets
 * @param schemas - Map of target to schema
 * @returns Fastify preHandler hook
 *
 * @example
 * app.get('/users/:id', {
 *   preHandler: validateMultiple({
 *     params: userIdSchema,
 *     query: paginationSchema
 *   })
 * }, handler);
 */
export function validateMultiple(schemas: Partial<Record<ValidationTarget, ZodSchema>>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const errors: Record<string, any[]> = {};

    // Validate each target
    for (const [target, schema] of Object.entries(schemas)) {
      try {
        const data = await schema.parseAsync(request[target as ValidationTarget]);
        (request as any)[target] = data;
      } catch (error) {
        if (error instanceof ZodError) {
          errors[target] = formatZodError(error);
        }
      }
    }

    // If any validation failed, throw combined error
    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Validation failed', errors);
    }
  };
}
