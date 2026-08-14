import axios from 'axios';

export type ApiErrorKind =
  | 'invalid-credentials'
  | 'locked'
  | 'rate-limited'
  | 'network'
  | 'server'
  | 'request';

export interface ClassifiedApiError {
  kind: ApiErrorKind;
  message: string;
  retryAfter?: number;
  requestId?: string;
}

function retryAfterSeconds(value: unknown): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

export function classifyApiError(error: unknown, fallback: string): ClassifiedApiError {
  if (!axios.isAxiosError(error)) return { kind: 'request', message: fallback };

  const status = error.response?.status;
  const code = error.response?.data?.error?.code;
  const requestId = error.response?.data?.requestId || error.response?.headers?.['x-request-id'];
  const retryAfter = retryAfterSeconds(error.response?.headers?.['retry-after']);

  if (!error.response) {
    return {
      kind: 'network',
      message: 'Unable to reach the API. Check your connection and try again.',
    };
  }
  if (code === 'INVALID_CREDENTIALS') {
    return { kind: 'invalid-credentials', message: 'Invalid username or password.' };
  }
  if (code === 'ACCOUNT_LOCKED') {
    return {
      kind: 'locked',
      retryAfter,
      message: retryAfter
        ? `Account temporarily locked. Try again in ${retryAfter} seconds.`
        : 'Account temporarily locked. Try again later.',
    };
  }
  if (status === 429) {
    return {
      kind: 'rate-limited',
      retryAfter,
      message: retryAfter
        ? `Too many requests. Try again in ${retryAfter} seconds.`
        : 'Too many requests. Try again shortly.',
    };
  }
  if (status && status >= 500) {
    return {
      kind: 'server',
      requestId,
      message: requestId
        ? `The service could not complete the request. Request ID: ${requestId}`
        : 'The service could not complete the request. Try again shortly.',
    };
  }

  return {
    kind: 'request',
    requestId,
    message: error.response?.data?.error?.message || error.response?.data?.message || fallback,
  };
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return classifyApiError(error, fallback).message;
}
