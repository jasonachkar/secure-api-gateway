import type { IngestionAdapterStatus } from '../normalized-event.types.js';

export interface IngestionAdapter {
  name: string;
  getStatus(): Promise<IngestionAdapterStatus>;
}

export abstract class BaseIngestionAdapter implements IngestionAdapter {
  constructor(
    public readonly name: string,
    protected readonly provider: IngestionAdapterStatus['provider'],
    protected readonly configured: boolean,
    protected readonly detail?: string
  ) {}

  async getStatus(): Promise<IngestionAdapterStatus> {
    return {
      name: this.name,
      provider: this.provider,
      healthy: this.configured,
      configured: this.configured,
      detail: this.configured ? 'Ready to ingest' : this.detail || 'Not configured',
    };
  }
}
