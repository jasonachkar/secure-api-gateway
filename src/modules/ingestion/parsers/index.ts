import type { CloudProvider, DataProvenance, NormalizedSecurityEvent } from '../../security/types.js';
import { parseAwsEvent } from './aws.parser.js';
import { parseGcpEvent } from './gcp.parser.js';
import { parseAzureEvent } from './azure.parser.js';
import { parseGatewayEvent } from './gateway.parser.js';

export { parseAwsEvent } from './aws.parser.js';
export { parseGcpEvent } from './gcp.parser.js';
export { parseAzureEvent } from './azure.parser.js';
export { parseGatewayEvent } from './gateway.parser.js';

export function parseProviderEvent(
  provider: CloudProvider,
  raw: unknown,
  provenance: DataProvenance = 'replay'
): NormalizedSecurityEvent {
  switch (provider) {
    case 'aws':
      return parseAwsEvent(raw, provenance);
    case 'gcp':
      return parseGcpEvent(raw, provenance);
    case 'azure':
      return parseAzureEvent(raw, provenance);
    case 'gateway':
      return parseGatewayEvent(raw, provenance);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive}`);
    }
  }
}
