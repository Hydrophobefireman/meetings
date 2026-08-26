export type MarkState = "free" | "no";

export interface EventMeta {
  id: string;
  title: string;
  days: string[];
  created: number;
}

export interface ResponseRec {
  pid: string;
  name: string;
  marks: Record<string, MarkState>;
  at: number;
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function rid(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const MAX_DAYS = 20000;

/** Expand an inclusive [start, end] date range into a sorted list of ISO days. */
export function expandRange(start: string, end: string): string[] | null {
  const t1 = Date.parse(`${start}T00:00:00Z`);
  const t2 = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 < t1) return null;
  const days: string[] = [];
  for (let t = t1; t <= t2; t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10));
    if (days.length > MAX_DAYS) return null;
  }
  return days;
}

/**
 * Body is schema-validated (real dates, correct shape); this only
 * normalizes: expands ranges, dedupes + sorts legacy day arrays.
 */
export function normalizeDays(
  raw: { readonly start: string; readonly end: string } | readonly string[],
): string[] | null {
  if (Array.isArray(raw)) {
    const days = [...new Set(raw)].sort();
    return days.length > 0 && days.length <= MAX_DAYS ? days : null;
  }
  const r = raw as { readonly start: string; readonly end: string };
  return expandRange(r.start, r.end);
}

/** Keep only marks for days that belong to the event, with valid values. */
export function normalizeMarks(
  meta: EventMeta,
  raw: Record<string, unknown>,
): Record<string, MarkState> {
  const out: Record<string, MarkState> = {};
  const allowed = new Set(meta.days);
  for (const [k, v] of Object.entries(raw)) {
    if (allowed.has(k) && (v === "free" || v === "no")) out[k] = v;
  }
  return out;
}
