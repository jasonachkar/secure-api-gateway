import type { DetectionRule } from '../types.js';
import { gwAuth001 } from './gw-auth-001.js';
import { gwToken001 } from './gw-token-001.js';
import { awsIam001 } from './aws-iam-001.js';
import { awsIam002 } from './aws-iam-002.js';
import { gcpIam001 } from './gcp-iam-001.js';
import { azIam001 } from './az-iam-001.js';

export const allRules: DetectionRule[] = [
  gwAuth001,
  gwToken001,
  awsIam001,
  awsIam002,
  gcpIam001,
  azIam001,
];

export {
  gwAuth001,
  gwToken001,
  awsIam001,
  awsIam002,
  gcpIam001,
  azIam001,
};
