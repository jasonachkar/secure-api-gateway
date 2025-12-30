/**
 * Reports module schemas
 */

import { z } from 'zod';

/**
 * Report ID parameter schema
 */
export const reportIdSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]+$/, 'Invalid report ID format'),
});

export type ReportIdParams = z.infer<typeof reportIdSchema>;

/**
 * Report data interface (for type exports)
 */
export interface ReportData {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  createdBy: string;
}

/**
 * Report response schema (example)
 */
export const reportSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.number(),
  createdBy: z.string(),
});

export type Report = z.infer<typeof reportSchema>;
