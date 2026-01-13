import { BaseIngestionAdapter } from './base.adapter.js';

export class AzureSentinelAdapter extends BaseIngestionAdapter {
  constructor(configured: boolean) {
    super('Azure Sentinel', 'azure_sentinel', configured, 'Missing Azure Sentinel configuration');
  }
}
