/**
 * Persists DetectionResult objects by id so they can be retrieved later
 * (evidence export, GET /admin/security/detections) instead of only ever
 * existing transiently in an API response.
 */
import Redis from 'ioredis';
import type { DetectionResult } from '../security/types.js';

const DETECTION_KEY_PREFIX = 'sec:detection:';
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

export class DetectionStore {
  constructor(private readonly redis: Redis) {}

  async save(detection: DetectionResult): Promise<void> {
    await this.redis.setex(`${DETECTION_KEY_PREFIX}${detection.id}`, RETENTION_SECONDS, JSON.stringify(detection));
  }

  async saveAll(detections: DetectionResult[]): Promise<void> {
    if (detections.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const detection of detections) {
      pipeline.setex(`${DETECTION_KEY_PREFIX}${detection.id}`, RETENTION_SECONDS, JSON.stringify(detection));
    }
    await pipeline.exec();
  }

  async get(id: string): Promise<DetectionResult | null> {
    const raw = await this.redis.get(`${DETECTION_KEY_PREFIX}${id}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DetectionResult;
    } catch {
      return null;
    }
  }

  async getByIds(ids: string[]): Promise<DetectionResult[]> {
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(`${DETECTION_KEY_PREFIX}${id}`);
    }
    const results = await pipeline.exec();
    const detections: DetectionResult[] = [];
    if (!results) return detections;
    for (const [err, data] of results) {
      if (err || !data) continue;
      try {
        detections.push(JSON.parse(data as string) as DetectionResult);
      } catch {
        // skip invalid
      }
    }
    return detections;
  }
}
