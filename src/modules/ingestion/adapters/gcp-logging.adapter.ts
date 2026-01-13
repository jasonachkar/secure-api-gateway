import { BaseIngestionAdapter } from './base.adapter.js';

export class GcpLoggingAdapter extends BaseIngestionAdapter {
  constructor(configured: boolean) {
    super('GCP Logging', 'gcp_logging', configured, 'Missing GCP Logging configuration');
  }
}
