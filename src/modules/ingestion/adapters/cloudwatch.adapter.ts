import { BaseIngestionAdapter } from './base.adapter.js';

export class CloudWatchAdapter extends BaseIngestionAdapter {
  constructor(configured: boolean) {
    super('AWS CloudWatch', 'cloudwatch', configured, 'Missing CloudWatch configuration');
  }
}
