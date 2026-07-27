/**
 * Redacted evidence package export for a single investigation.
 *
 * Returned as a JSON object keyed by filename (not a literal .zip - no
 * archive library is used here) so a caller can save each entry as its own
 * file or the whole object as one JSON bundle. All event payloads were
 * already redacted at ingestion time (see redaction.ts), so no additional
 * redaction pass is needed here.
 */
import type { AuditService } from '../audit/audit.service.js';
import type { AuditLogEntry } from '../audit/audit.types.js';
import type { InvestigationService } from './investigation.service.js';
import type { SecurityEventStore } from '../ingestion/security-event.store.js';
import type { DetectionStore } from '../detection/detection.store.js';
import type { DetectionResult, NormalizedSecurityEvent, ResponseActionRecord, SecurityInvestigation } from '../security/types.js';
import { NotFoundError } from '../../lib/errors.js';

export interface EvidencePackage {
  'investigation.json': SecurityInvestigation;
  'normalized-events.json': NormalizedSecurityEvent[];
  'detections.json': DetectionResult[];
  'response-actions.json': ResponseActionRecord[];
  'audit-verification.json': {
    chainValid: boolean;
    entriesVerified: number;
    firstInvalidEntryId: string | null;
    tamperEvidenceModel: 'local-hash-chain';
    limitation: string;
    relatedAuditEntries: AuditLogEntry[];
  };
  'README.txt': string;
}

export interface EvidenceExportDeps {
  investigationService: InvestigationService;
  securityEventStore: SecurityEventStore;
  detectionStore: DetectionStore;
  auditService: AuditService;
}

export async function buildEvidencePackage(
  investigationId: string,
  deps: EvidenceExportDeps
): Promise<EvidencePackage> {
  const { investigationService, securityEventStore, detectionStore, auditService } = deps;

  const investigation = await investigationService.getInvestigation(investigationId);
  if (!investigation) throw new NotFoundError('Investigation');

  const [events, detections, chainResult, recentAuditEntries] = await Promise.all([
    securityEventStore.getEventsByIds(investigation.eventIds),
    detectionStore.getByIds(investigation.detectionIds),
    auditService.verifyChain(),
    auditService.query({ limit: 5000 }),
  ]);

  const relatedAuditEntries = recentAuditEntries.filter(
    (entry) => (entry.metadata as Record<string, unknown> | undefined)?.investigationId === investigationId
  );

  const readme = [
    `Evidence export for investigation ${investigation.id}`,
    `Generated: ${new Date().toISOString()}`,
    `Title: ${investigation.title}`,
    `Severity: ${investigation.severity}`,
    `Status: ${investigation.status}`,
    `Provenance: ${investigation.provenance}`,
    '',
    'Contents:',
    '  investigation.json      - the investigation record (status, timeline, correlation explanation)',
    '  normalized-events.json  - canonical NormalizedSecurityEvent records this investigation is built from',
    '  detections.json         - DetectionResult records that triggered/updated this investigation',
    '  response-actions.json   - response actions taken against this investigation (mode: enforced/simulated/disabled)',
    '  audit-verification.json - tamper-evident audit hash-chain verification result and related audit entries',
    '',
    'Limitations (read before treating this as forensic-grade evidence):',
    '  - The audit hash chain is tamper-EVIDENT, not tamper-PROOF: it detects retroactive',
    '    edits to entries already written, but a party with write access to the underlying',
    '    store could still append fabricated entries or discard the whole chain. It is not',
    '    externally anchored (e.g. to a separate immutable log or blockchain).',
    '  - Raw event payloads have been redacted of recognized secret patterns before storage;',
    '    redaction is pattern-based and may not catch every possible secret shape.',
    '  - This export reflects investigation state at generation time; it is not automatically refreshed.',
  ].join('\n');

  return {
    'investigation.json': investigation,
    'normalized-events.json': events,
    'detections.json': detections,
    'response-actions.json': investigation.responseActions,
    'audit-verification.json': {
      chainValid: chainResult.valid,
      entriesVerified: chainResult.checked,
      firstInvalidEntryId: chainResult.brokenEntryId ?? null,
      tamperEvidenceModel: 'local-hash-chain',
      limitation:
        'Tamper-evident, not tamper-proof: detects retroactive edits to existing entries but is not externally anchored.',
      relatedAuditEntries,
    },
    'README.txt': readme,
  };
}
