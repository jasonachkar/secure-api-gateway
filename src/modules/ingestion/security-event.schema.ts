/**
 * Zod validation and helpers for canonical NormalizedSecurityEvent.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { redactObject } from './redaction.js';
import {
  SECURITY_EVENT_SCHEMA_VERSION,
  type CloudProvider,
  type DataProvenance,
  type NormalizedSecurityEvent,
  type SecurityEventCategory,
  type SecuritySeverity,
  type EventOutcome,
  type EvidenceReference,
  type SecurityPrincipal,
  type SecurityResource,
} from '../security/types.js';

export const dataProvenanceSchema = z.enum(['live', 'replay', 'synthetic', 'planned']);
export const cloudProviderSchema = z.enum(['azure', 'aws', 'gcp', 'gateway']);
export const securitySeveritySchema = z.enum([
  'informational',
  'low',
  'medium',
  'high',
  'critical',
]);
export const securityEventCategorySchema = z.enum([
  'authentication',
  'authorization',
  'credential-access',
  'persistence',
  'privilege-escalation',
  'configuration-change',
  'network',
  'data-access',
  'rate-limit',
  'malicious-request',
  'availability',
  'audit-integrity',
  'other',
]);
export const eventOutcomeSchema = z.enum(['success', 'failure', 'unknown']);

const principalSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
});

const resourceSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  accountOrProjectId: z.string().optional(),
  region: z.string().optional(),
});

const evidenceSchema = z.object({
  type: z.enum(['raw-event', 'audit-log', 'request', 'terraform', 'test', 'source-code']),
  label: z.string(),
  reference: z.string(),
});

export const normalizedSecurityEventSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.string().min(1),
  providerEventId: z.string().min(1),
  provider: cloudProviderSchema,
  sourceService: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  ingestedAt: z.string().datetime({ offset: true }),
  ingestionDelayMs: z.number().int().nonnegative(),
  accountOrProjectId: z.string().optional(),
  region: z.string().optional(),
  principal: principalSchema.optional(),
  resource: resourceSchema.optional(),
  action: z.string().min(1),
  outcome: eventOutcomeSchema,
  sourceIp: z.string().optional(),
  userAgent: z.string().optional(),
  severity: securitySeveritySchema,
  category: securityEventCategorySchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  provenance: dataProvenanceSchema,
  correlationId: z.string().optional(),
  detectionRuleIds: z.array(z.string()),
  evidence: z.array(evidenceSchema),
  dedupeHash: z.string().min(1),
  rawEvent: z.record(z.unknown()),
});

export type CreateSecurityEventInput = {
  providerEventId: string;
  provider: CloudProvider;
  sourceService: string;
  occurredAt: string | Date | number;
  accountOrProjectId?: string;
  region?: string;
  principal?: SecurityPrincipal;
  resource?: SecurityResource;
  action: string;
  outcome: EventOutcome;
  sourceIp?: string;
  userAgent?: string;
  severity: SecuritySeverity;
  category: SecurityEventCategory;
  title: string;
  summary: string;
  provenance: DataProvenance;
  correlationId?: string;
  detectionRuleIds?: string[];
  evidence?: EvidenceReference[];
  rawEvent: Record<string, unknown>;
  id?: string;
  ingestedAt?: string | Date | number;
};

function toIso(value: string | Date | number): string {
  if (typeof value === 'string') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid timestamp: ${value}`);
    }
    return d.toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  return value.toISOString();
}

export function computeDedupeHash(input: {
  provider: CloudProvider;
  providerEventId: string;
  action: string;
  occurredAt: string;
  sourceIp?: string;
  accountOrProjectId?: string;
}): string {
  const material = [
    input.provider,
    input.providerEventId,
    input.action,
    input.occurredAt,
    input.sourceIp ?? '',
    input.accountOrProjectId ?? '',
  ].join('|');
  return createHash('sha256').update(material).digest('hex');
}

export function createNormalizedSecurityEvent(
  input: CreateSecurityEventInput
): NormalizedSecurityEvent {
  const occurredAt = toIso(input.occurredAt);
  const ingestedAt = toIso(input.ingestedAt ?? Date.now());
  const ingestionDelayMs = Math.max(
    0,
    new Date(ingestedAt).getTime() - new Date(occurredAt).getTime()
  );

  const redactedRaw = redactObject(input.rawEvent);
  const dedupeHash = computeDedupeHash({
    provider: input.provider,
    providerEventId: input.providerEventId,
    action: input.action,
    occurredAt,
    sourceIp: input.sourceIp,
    accountOrProjectId: input.accountOrProjectId,
  });

  const event: NormalizedSecurityEvent = {
    id: input.id ?? nanoid(),
    schemaVersion: SECURITY_EVENT_SCHEMA_VERSION,
    providerEventId: input.providerEventId,
    provider: input.provider,
    sourceService: input.sourceService,
    occurredAt,
    ingestedAt,
    ingestionDelayMs,
    accountOrProjectId: input.accountOrProjectId,
    region: input.region,
    principal: input.principal,
    resource: input.resource,
    action: input.action,
    outcome: input.outcome,
    sourceIp: input.sourceIp,
    userAgent: input.userAgent,
    severity: input.severity,
    category: input.category,
    title: input.title,
    summary: input.summary,
    provenance: input.provenance,
    correlationId: input.correlationId,
    detectionRuleIds: input.detectionRuleIds ?? [],
    evidence: input.evidence ?? [],
    dedupeHash,
    rawEvent: redactedRaw,
  };

  // Validate for correctness (throws on shape violations); the object literal
  // above is already the canonical NormalizedSecurityEvent shape, so we return
  // it directly rather than zod's inferred output (see note on
  // validateNormalizedSecurityEvent for why that inferred type isn't used directly).
  normalizedSecurityEventSchema.parse(event);
  return event;
}

export function validateNormalizedSecurityEvent(
  value: unknown
): NormalizedSecurityEvent {
  // zod's inferred output type for this schema does not structurally narrow
  // required vs. optional fields the way TS expects against the hand-written
  // NormalizedSecurityEvent interface, so we assert through unknown after
  // runtime validation has already enforced the real shape.
  return normalizedSecurityEventSchema.parse(value) as unknown as NormalizedSecurityEvent;
}

/**
 * Migrate legacy NormalizedEvent shape into the canonical schema when possible.
 */
export function migrateLegacyNormalizedEvent(legacy: {
  id: string;
  event_type: string;
  source: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  payload: Record<string, unknown>;
}): NormalizedSecurityEvent {
  const provider: CloudProvider =
    legacy.source.includes('cloudwatch') || legacy.source.includes('aws')
      ? 'aws'
      : legacy.source.includes('gcp')
        ? 'gcp'
        : legacy.source.includes('azure') || legacy.source.includes('sentinel')
          ? 'azure'
          : 'gateway';

  return createNormalizedSecurityEvent({
    id: legacy.id,
    providerEventId:
      typeof legacy.payload.eventId === 'string'
        ? legacy.payload.eventId
        : legacy.id,
    provider,
    sourceService: legacy.source,
    occurredAt: legacy.timestamp,
    action: legacy.event_type,
    outcome: 'unknown',
    severity: legacy.severity,
    category: 'other',
    title: legacy.event_type,
    summary: `Migrated legacy event from ${legacy.source}`,
    provenance: 'synthetic',
    rawEvent: legacy.payload,
    evidence: [
      {
        type: 'source-code',
        label: 'Legacy normalized event migration',
        reference: 'src/modules/ingestion/security-event.schema.ts',
      },
    ],
  });
}
