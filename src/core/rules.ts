// Чистые правила: монеты, код EZ-XXXX, ник, клиентский античит. Без DOM и без состояния.
import type { HintsUsed, RejectReason, RoomIndex } from './types';

// ---------------------------------------------------------------- монеты (§3)

/** Награда комнаты по номеру верной попытки: [1-я, 2-я, 3+]. */
export const REWARDS: Readonly<Record<RoomIndex, readonly [number, number, number]>> = {
  1: [10, 7, 5],
  2: [15, 11, 8],
  3: [20, 14, 10],
  4: [30, 22, 15],
};

export const MAX_TOTAL_COINS = 75;

/**
 * Монеты за комнату. `attempts` — число нажатий «Проверить», включая верное.
 * Вторая подсказка обнуляет награду; результат никогда не меньше нуля.
 */
export function rewardFor(room: RoomIndex, attempts: number, hintsUsed: HintsUsed | number): number {
  if (hintsUsed >= 2) return 0;
  const row = REWARDS[room];
  const n = Number.isFinite(attempts) ? Math.floor(attempts) : 1;
  const col = Math.min(Math.max(n, 1), 3) - 1;
  return Math.max(0, row[col]);
}

// ---------------------------------------------------------------- код EZ-XXXX

export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_RE = new RegExp(`^EZ-[${CODE_ALPHABET}]{4}$`);

function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
}

/** `randomFn` возвращает число в [0, 1) (по умолчанию — crypto.getRandomValues). */
export function generateVerificationCode(randomFn: () => number = cryptoRandom): string {
  let out = 'EZ-';
  for (let i = 0; i < 4; i++) {
    const idx = Math.min(CODE_ALPHABET.length - 1, Math.floor(randomFn() * CODE_ALPHABET.length));
    out += CODE_ALPHABET[Math.max(0, idx)];
  }
  return out;
}

export function isValidVerificationCode(s: unknown): s is string {
  return typeof s === 'string' && CODE_RE.test(s);
}

// Кириллические двойники латиницы (ребёнок мог набрать код на русской раскладке).
const CYR_TO_LAT_CODE: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y',
};

/** `ez8492`, ` ez-8492 `, `8492` → `EZ-8492`; всё, что не становится валидным кодом, → null. */
export function normalizeVerificationCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.toUpperCase().replace(/[АВЕКМНОРСТХУ]/g, (ch) => CYR_TO_LAT_CODE[ch] ?? ch);
  s = s.replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('EZ') && s.length === 6) s = s.slice(2);
  if (s.length !== 4) return null;
  const code = `EZ-${s}`;
  return isValidVerificationCode(code) ? code : null;
}

// ---------------------------------------------------------------- ник (R47, G04)

export type PlayerNameError = 'TOO_SHORT' | 'TOO_LONG' | 'BAD_CHARS' | 'PROFANITY';
export type PlayerNameResult =
  | { ok: true; value: string }
  | { ok: false; error: PlayerNameError; message: string };

export const PLAYER_NAME_MIN = 2;
export const PLAYER_NAME_MAX = 16;
const NAME_ALLOWED = /^[A-Za-zА-Яа-яЁё0-9 _.\-]+$/;

const NAME_MESSAGES: Record<PlayerNameError, string> = {
  TOO_SHORT: `Имя слишком короткое — нужно хотя бы ${PLAYER_NAME_MIN} символа`,
  TOO_LONG: `Имя слишком длинное — не больше ${PLAYER_NAME_MAX} символов`,
  BAD_CHARS: 'Можно только буквы, цифры, пробел и знаки _ - .',
  PROFANITY: 'Давай придумаем другое имя — без грубых слов',
};

// Корни после нормализации (ё→е, латинские двойники → кириллица, без разделителей).
const RU_ROOTS = [
  'хуй', 'хуе', 'хуя', 'хуи', 'хуйн', 'пизд', 'ебан', 'ебал', 'ебат', 'ебуч', 'ебут', 'ебар', 'еблан',
  'заеб', 'уеб', 'выеб', 'въеб', 'отъеб', 'доеб', 'наеб', 'проеб', 'долбоеб', 'бля', 'сука', 'сучк',
  'сучар', 'мудак', 'мудил', 'пидор', 'пидар', 'пидр', 'гандон', 'гондон', 'говн', 'дерьм', 'залуп',
  'шлюх', 'жоп', 'дроч', 'ублюд', 'мраз', 'шалав',
];
// Корни в латинской форме: английский мат и транслит русского.
const EN_ROOTS = [
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'asshole', 'fag', 'nigg', 'whore', 'slut', 'porn',
  'penis', 'pussy', 'bastard', 'hitler', 'nazi',
  'hui', 'huy', 'huj', 'xuy', 'xyu', 'xui', 'pizd', 'pidor', 'pidar', 'pidr', 'suka', 'blya', 'eban',
  'ebal', 'ebat', 'mudak', 'gandon', 'zhopa', 'jopa', 'govno', 'dermo', 'zalup', 'shluh',
];

const LAT_TO_CYR: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
  '0': 'о', '1': 'и', '3': 'з', '4': 'ч', '6': 'б',
};
const CYR_TO_LAT: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
};

const collapseRepeats = (s: string): string => s.replace(/(.)\1+/g, '$1');

function normalizeForFilter(raw: string): { cyr: string; lat: string } {
  const lower = raw.toLowerCase().replace(/ё/g, 'е');
  const cyr = collapseRepeats(
    [...lower].map((ch) => LAT_TO_CYR[ch] ?? ch).join('').replace(/[^а-я]/g, ''),
  );
  const lat = collapseRepeats(
    [...lower].map((ch) => CYR_TO_LAT[ch] ?? ch).join('').replace(/[^a-z]/g, ''),
  );
  return { cyr, lat };
}

function containsProfanity(raw: string): boolean {
  const { cyr, lat } = normalizeForFilter(raw);
  // Сравниваем и со схлопнутыми повторами корня (напр. «сучк» не схлопывается, «ass» — не в списке).
  return (
    RU_ROOTS.some((r) => cyr.includes(collapseRepeats(r))) ||
    EN_ROOTS.some((r) => lat.includes(collapseRepeats(r)))
  );
}

export function validatePlayerName(raw: unknown): PlayerNameResult {
  const value = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  const fail = (error: PlayerNameError): PlayerNameResult => ({ ok: false, error, message: NAME_MESSAGES[error] });
  if ([...value].length < PLAYER_NAME_MIN) return fail('TOO_SHORT');
  if ([...value].length > PLAYER_NAME_MAX) return fail('TOO_LONG');
  if (!NAME_ALLOWED.test(value)) return fail('BAD_CHARS');
  if (containsProfanity(value)) return fail('PROFANITY');
  return { ok: true, value };
}

// ---------------------------------------------------------------- античит (R45)

export const MAX_POINTS_PER_SECOND = 120;
export const MIN_RUN_SECONDS = 5;
export const MAX_SCORE = 50000;

export type RunPlausibility =
  | { ok: true }
  | { ok: false; reason: Extract<RejectReason, 'CHEAT_SPEED' | 'TOO_SHORT' | 'SCORE_RANGE'> };

export function isRunPlausible(run: { score: number; timeSpentSeconds: number }): RunPlausibility {
  const { score, timeSpentSeconds: t } = run;
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return { ok: false, reason: 'SCORE_RANGE' };
  if (!Number.isFinite(t) || t < MIN_RUN_SECONDS) return { ok: false, reason: 'TOO_SHORT' };
  if (score / t > MAX_POINTS_PER_SECOND) return { ok: false, reason: 'CHEAT_SPEED' };
  return { ok: true };
}
