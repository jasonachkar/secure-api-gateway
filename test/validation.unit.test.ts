/**
 * Validation Unit Tests
 * Tests Zod schema validation and error formatting
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { validate } from '../src/middleware/validation.js';
import { ValidationError } from '../src/lib/errors.js';

describe('Validation Middleware', () => {
  // Arrange: Create test schema
  const testSchema = z.object({
    username: z.string().min(3).max(50),
    email: z.string().email(),
    age: z.number().int().min(18).optional(),
  });

  describe('Valid data', () => {
    it('should pass validation with valid data', async () => {
      // Arrange
      const validData = {
        username: 'testuser',
        email: 'test@example.com',
        age: 25,
      };

      const mockRequest = {
        body: validData,
      } as any;

      const mockReply = {} as any;

      const middleware = validate(testSchema, 'body');

      // Act & Assert
      await expect(middleware(mockRequest, mockReply)).resolves.toBeUndefined();
      expect(mockRequest.body).toEqual(validData);
    });

    it('should strip unknown fields for security', async () => {
      // Arrange
      const dataWithExtra = {
        username: 'testuser',
        email: 'test@example.com',
        extraField: 'should be removed',
        __proto__: 'malicious',
      };

      const mockRequest = {
        body: dataWithExtra,
      } as any;

      const mockReply = {} as any;

      const middleware = validate(testSchema, 'body');

      // Act
      await middleware(mockRequest, mockReply);

      // Assert: unknown fields removed
      expect(mockRequest.body).toEqual({
        username: 'testuser',
        email: 'test@example.com',
      });
      expect(mockRequest.body).not.toHaveProperty('extraField');
      expect(mockRequest.body).not.toHaveProperty('__proto__');
    });
  });

  describe('Invalid data', () => {
    it('should throw ValidationError with formatted errors', async () => {
      // Arrange
      const invalidData = {
        username: 'ab', // Too short
        email: 'invalid-email', // Invalid format
        age: 15, // Too young
      };

      const mockRequest = {
        body: invalidData,
      } as any;

      const mockReply = {} as any;

      const middleware = validate(testSchema, 'body');

      // Act & Assert
      await expect(middleware(mockRequest, mockReply)).rejects.toThrow(ValidationError);

      try {
        await middleware(mockRequest, mockReply);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.statusCode).toBe(400);
        expect(validationError.code).toBe('VALIDATION_ERROR');
        expect(validationError.errors).toBeDefined();
      }
    });

    it('should handle missing required fields', async () => {
      // Arrange
      const incompleteData = {
        username: 'testuser',
        // Missing email
      };

      const mockRequest = {
        body: incompleteData,
      } as any;

      const mockReply = {} as any;

      const middleware = validate(testSchema, 'body');

      // Act & Assert
      await expect(middleware(mockRequest, mockReply)).rejects.toThrow(ValidationError);
    });
  });
});
