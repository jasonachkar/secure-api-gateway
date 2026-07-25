/**
 * Redact secrets and credentials from provider payloads before storage or export.
 */

const SENSITIVE_KEY_PATTERN =
  /pass(word)?|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|refresh[_-]?token|session|credential|passwd|pwd|bearer/i;

const SENSITIVE_VALUE_PATTERN =
  /\b(Bearer\s+[A-Za-z0-9\-._~+/]+=*|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/i;

const REDACTED = '[REDACTED]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    if (SENSITIVE_VALUE_PATTERN.test(value)) {
      return value.replace(SENSITIVE_VALUE_PATTERN, REDACTED);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(String(index), item));
  }

  if (isPlainObject(value)) {
    return redactObject(value);
  }

  return value;
}

export function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = redactValue(key, value);
  }
  return output;
}

/**
 * Deep-clone and redact an arbitrary JSON-like structure.
 */
export function redactUnknown(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item, index) => redactValue(String(index), item));
  }
  if (isPlainObject(input)) {
    return redactObject(input);
  }
  if (typeof input === 'string' && SENSITIVE_VALUE_PATTERN.test(input)) {
    return input.replace(SENSITIVE_VALUE_PATTERN, REDACTED);
  }
  return input;
}
