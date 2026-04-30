const VE_LOCALE = 'es-VE';
const VE_TIME_ZONE = 'America/Caracas';

type DateInput = Date | string | number;

function toDate(input?: DateInput): Date {
  if (input instanceof Date) return input;
  if (typeof input === 'string' || typeof input === 'number') {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

export function formatDateVE(
  input?: DateInput,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toDate(input);
  return new Intl.DateTimeFormat(VE_LOCALE, {
    timeZone: VE_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function formatTimeVE(
  input?: DateInput,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toDate(input);
  return new Intl.DateTimeFormat(VE_LOCALE, {
    timeZone: VE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  }).format(date);
}

export function getVenezuelaDateKey(input?: DateInput): string {
  const date = toDate(input);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function isSameDayVE(a: DateInput, b: DateInput): boolean {
  return getVenezuelaDateKey(a) === getVenezuelaDateKey(b);
}
