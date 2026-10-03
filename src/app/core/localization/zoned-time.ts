/** The browser's IANA zone, the natural default for a new tender. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** An instant as a local "YYYY-MM-DDTHH:mm" in a zone, for comparing with local deadline values; UTC when the zone is unknown. */
export function localDateTimeParts(instant: Date, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '00';
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  } catch {
    return instant.toISOString().slice(0, 16);
  }
}
