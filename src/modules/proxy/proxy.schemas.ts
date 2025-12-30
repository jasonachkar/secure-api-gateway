/**
 * Proxy module schemas
 */

import { z } from 'zod';

/**
 * Echo request schema
 */
export const echoRequestSchema = z.object({
  message: z.string().min(1).max(1000),
});

export type EchoRequest = z.infer<typeof echoRequestSchema>;
