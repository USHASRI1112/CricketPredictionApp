// Axios errors contain request headers and URLs. Never serialize whole errors.
function safe(values: unknown[]): unknown[] {
  return values.map(value => value instanceof Error ? value.message : value);
}
export const logger = {
  info: (...values: unknown[]) => console.info(...safe(values)),
  warn: (...values: unknown[]) => console.warn(...safe(values)),
  error: (...values: unknown[]) => console.error(...safe(values)),
};
