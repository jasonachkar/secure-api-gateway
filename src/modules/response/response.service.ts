/**
 * Response actions with honest execution modes (enforced / simulated / disabled).
 */

import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import { logger } from '../../lib/logger.js';
import type { ThreatIntelService } from '../admin/threat-intel.service.js';
import type { TokenStore } from '../auth/token.store.js';
import type { AuditService } from '../audit/audit.service.js';
import { AuditEventType } from '../audit/audit.types.js';
import type { ResponseActionRecord, ResponseExecutionMode } from '../security/types.js';
import type { PipelineMetrics } from '../security/pipeline-metrics.js';

const ACTION_KEY_PREFIX = 'sec:response:';
const ACTION_INDEX_KEY = 'sec:response:index';
const ENFORCEMENT_SIGHTINGS_KEY = 'sec:response:sightings';
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

export class ResponseService {
  constructor(
    private readonly redis: Redis,
    private readonly threatIntel: ThreatIntelService,
    private readonly tokenStore: TokenStore,
    private readonly audit?: AuditService,
    private readonly metrics?: PipelineMetrics
  ) {}

  async blockIp(params: {
    ip: string;
    actor: string;
    reason: string;
    correlationId?: string;
    investigationId?: string;
  }): Promise<ResponseActionRecord> {
    try {
      await this.threatIntel.blockIP(params.ip, params.actor, params.reason);
      const record = await this.persist({
        action: 'block_ip',
        mode: 'enforced',
        target: params.ip,
        actor: params.actor,
        reason: params.reason,
        result: 'success',
        correlationId: params.correlationId,
        investigationId: params.investigationId,
      });
      await this.auditAction(record);
      await this.metrics?.recordResponse(true);
      return record;
    } catch (error) {
      const record = await this.persist({
        action: 'block_ip',
        mode: 'enforced',
        target: params.ip,
        actor: params.actor,
        reason: params.reason,
        result: 'failure',
        correlationId: params.correlationId,
        investigationId: params.investigationId,
        details: { error: error instanceof Error ? error.message : 'unknown' },
      });
      await this.metrics?.recordResponse(false);
      return record;
    }
  }

  async unblockIp(params: {
    ip: string;
    actor: string;
    reason: string;
    correlationId?: string;
    investigationId?: string;
  }): Promise<ResponseActionRecord> {
    try {
      await this.threatIntel.unblockIP(params.ip);
      const record = await this.persist({
        action: 'unblock_ip',
        mode: 'enforced',
        target: params.ip,
        actor: params.actor,
        reason: params.reason,
        result: 'success',
        correlationId: params.correlationId,
        investigationId: params.investigationId,
      });
      await this.auditAction(record);
      await this.metrics?.recordResponse(true);
      return record;
    } catch (error) {
      const record = await this.persist({
        action: 'unblock_ip',
        mode: 'enforced',
        target: params.ip,
        actor: params.actor,
        reason: params.reason,
        result: 'failure',
        correlationId: params.correlationId,
        investigationId: params.investigationId,
        details: { error: error instanceof Error ? error.message : 'unknown' },
      });
      await this.metrics?.recordResponse(false);
      return record;
    }
  }

  async revokeSessions(params: {
    userId: string;
    username?: string;
    actor: string;
    reason: string;
    correlationId?: string;
    investigationId?: string;
    familyIds?: string[];
  }): Promise<ResponseActionRecord> {
    try {
      let revoked = 0;
      if (params.familyIds?.length) {
        for (const familyId of params.familyIds) {
          await this.tokenStore.revokeFamily(familyId, 7 * 24 * 60 * 60);
          revoked += 1;
        }
      } else {
        revoked = await this.tokenStore.revokeAllForUser(params.userId);
      }

      const record = await this.persist({
        action: 'revoke_sessions',
        mode: 'enforced',
        target: params.username ?? params.userId,
        actor: params.actor,
        reason: params.reason,
        result: 'success',
        correlationId: params.correlationId,
        investigationId: params.investigationId,
        details: { userId: params.userId, familiesRevoked: revoked },
      });
      await this.auditAction(record);
      await this.metrics?.recordResponse(true);
      return record;
    } catch (error) {
      const record = await this.persist({
        action: 'revoke_sessions',
        mode: 'enforced',
        target: params.username ?? params.userId,
        actor: params.actor,
        reason: params.reason,
        result: 'failure',
        correlationId: params.correlationId,
        investigationId: params.investigationId,
        details: { error: error instanceof Error ? error.message : 'unknown' },
      });
      await this.metrics?.recordResponse(false);
      return record;
    }
  }

  async openTicket(params: {
    actor: string;
    reason: string;
    correlationId?: string;
    investigationId?: string;
    title?: string;
  }): Promise<ResponseActionRecord> {
    const simId = `sim-ticket-${createHash('sha256')
      .update(`${params.investigationId ?? ''}:${params.reason}:${params.correlationId ?? ''}`)
      .digest('hex')
      .slice(0, 12)}`;

    const record = await this.persist({
      action: 'open_ticket',
      mode: 'simulated',
      target: simId,
      actor: params.actor,
      reason: params.reason,
      result: 'success',
      correlationId: params.correlationId,
      investigationId: params.investigationId,
      details: {
        simulated: true,
        title: params.title ?? 'Simulated security ticket',
        note: 'No external ITSM integration is configured.',
      },
    });
    await this.auditAction(record);
    return record;
  }

  async disableCloudIdentity(
    provider: 'aws' | 'gcp' | 'entra',
    params: {
      actor: string;
      reason: string;
      target?: string;
      correlationId?: string;
      investigationId?: string;
    }
  ): Promise<ResponseActionRecord> {
    const action =
      provider === 'aws'
        ? 'disable_aws_identity'
        : provider === 'gcp'
          ? 'disable_gcp_identity'
          : 'disable_entra_identity';

    const record = await this.persist({
      action,
      mode: 'disabled' as ResponseExecutionMode,
      target: params.target,
      actor: params.actor,
      reason: params.reason,
      result: 'skipped',
      correlationId: params.correlationId,
      investigationId: params.investigationId,
      details: {
        note: 'Cloud identity disable requires a safe sandbox integration and is not enabled.',
      },
    });
    await this.auditAction(record);
    return record;
  }

  async recordEnforcementSighting(params: {
    ip: string;
    requestId: string;
    path: string;
    method: string;
  }): Promise<void> {
    const entry = {
      ...params,
      timestamp: new Date().toISOString(),
    };
    await this.redis.lpush(ENFORCEMENT_SIGHTINGS_KEY, JSON.stringify(entry));
    await this.redis.ltrim(ENFORCEMENT_SIGHTINGS_KEY, 0, 199);
  }

  async getAction(id: string): Promise<ResponseActionRecord | null> {
    const raw = await this.redis.get(`${ACTION_KEY_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as ResponseActionRecord;
  }

  async listActions(limit = 50): Promise<ResponseActionRecord[]> {
    const ids = await this.redis.zrevrange(ACTION_INDEX_KEY, 0, limit - 1);
    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(`${ACTION_KEY_PREFIX}${id}`);
    }
    const results = await pipeline.exec();
    const actions: ResponseActionRecord[] = [];
    if (!results) return actions;
    for (const [err, data] of results) {
      if (!err && data) {
        actions.push(JSON.parse(data as string) as ResponseActionRecord);
      }
    }
    return actions;
  }

  private async persist(
    partial: Omit<ResponseActionRecord, 'id' | 'timestamp'>
  ): Promise<ResponseActionRecord> {
    const record: ResponseActionRecord = {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      ...partial,
    };
    await this.redis.setex(
      `${ACTION_KEY_PREFIX}${record.id}`,
      RETENTION_SECONDS,
      JSON.stringify(record)
    );
    await this.redis.zadd(ACTION_INDEX_KEY, Date.now(), record.id);
    logger.info(
      {
        actionId: record.id,
        action: record.action,
        mode: record.mode,
        result: record.result,
        target: record.target,
      },
      'Response action recorded'
    );
    return record;
  }

  private async auditAction(record: ResponseActionRecord): Promise<void> {
    if (!this.audit) return;
    try {
      await this.audit.log({
        eventType: AuditEventType.SECURITY_RESPONSE_ACTION,
        ip: record.target?.match(/^\d/) ? record.target : '0.0.0.0',
        requestId: record.correlationId ?? record.id,
        success: record.result === 'success',
        message: `Response action ${record.action} (${record.mode})`,
        username: record.actor,
        metadata: {
          responseActionId: record.id,
          mode: record.mode,
          action: record.action,
          target: record.target,
          investigationId: record.investigationId,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to audit response action');
    }
  }
}
