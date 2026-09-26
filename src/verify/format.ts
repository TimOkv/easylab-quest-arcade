// Время для людей — Москва (Europe/Moscow). Москва живёт в UTC+3 без перехода на летнее время.

const MSK_OFFSET = '+03:00';

const fmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type Parts = { y: string; mo: string; d: string; h: string; mi: string; s: string };

function parts(value: string | number | Date | null | undefined): Parts | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const p: Record<string, string> = {};
  for (const { type, value: v } of fmt.formatToParts(date)) p[type] = v;
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** `ДД.ММ.ГГГГ ЧЧ:ММ` по Москве; пусто/мусор → «—». */
export function formatMsk(value: string | number | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p.d}.${p.mo}.${p.y} ${p.h}:${p.mi}` : '—';
}

/** `ДД.ММ ЧЧ:ММ` по Москве. */
export function formatMskShort(value: string | number | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p.d}.${p.mo} ${p.h}:${p.mi}` : '—';
}

/** `ЧЧ:ММ:СС` по Москве. */
export function formatMskClock(value: string | number | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p.h}:${p.mi}:${p.s}` : '—';
}

/** Значение для `<input type="datetime-local">` в московском времени. */
export function toMskInput(value: string | number | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}` : '';
}

/** `YYYY-MM-DDTHH:MM` (московское время) → ISO-строка с зоной; пусто/мусор → null. */
export function fromMskInput(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:00${MSK_OFFSET}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}
