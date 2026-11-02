// Cric API's dateTimeGMT is UTC even when its ISO value omits the Z suffix.
export function parseMatchStart(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value.trim())) return null;
  const iso = value.trim().replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMatchTime(value?: string, timeZone?: string): string | null {
  const date = parseMatchStart(value);
  if (!date) return null;
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });
}
