/**
 * Extracts a human-readable message from an API error.
 * Axios errors default to a generic "Request failed with status code NNN"
 * (err.message) even when the backend sent a real error body - prefer that
 * body's message so the UI shows why a request actually failed.
 */
export function getErrorMessage(err: any, fallback: string): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}
