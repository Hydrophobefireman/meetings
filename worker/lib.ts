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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Expand an inclusive [start, end] date range into a sorted list of ISO days. */
export function expandRange(start: string, end: string): string[] | null {
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return null;
  const t1 = Date.parse(`${start}T00:00:00Z`);
  const t2 = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 < t1) return null;
  // round-trip check rejects things like 2026-02-31
  if (
    new Date(t1).toISOString().slice(0, 10) !== start ||
    new Date(t2).toISOString().slice(0, 10) !== end
  ) {
    return null;
  }
  const days: string[] = [];
  for (let t = t1; t <= t2; t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10));
    // overflow guard for nonsense inputs like year 999999
    if (days.length > 20000) return null;
  }
  return days;
}

export function normalizeDays(raw: unknown): string[] | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const { start, end } = raw as Record<string, unknown>;
    if (typeof start === "string" && typeof end === "string") {
      return expandRange(start, end);
    }
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const uniq = new Set<string>();
  for (const d of raw) {
    if (typeof d !== "string" || !DATE_RE.test(d)) return null;
    const t = Date.parse(`${d}T00:00:00Z`);
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d) {
      return null;
    }
    uniq.add(d);
  }
  const days = [...uniq].sort();
  return days.length > 0 ? days : null;
}

export function normalizeMarks(
  meta: EventMeta,
  raw: unknown,
): Record<string, MarkState> {
  const out: Record<string, MarkState> = {};
  if (!raw || typeof raw !== "object") return out;
  const allowed = new Set(meta.days);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (allowed.has(k) && (v === "free" || v === "no")) out[k] = v;
  }
  return out;
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().slice(0, 40);
  return name.length >= 1 ? name : null;
}

export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.trim().slice(0, 80);
  return title.length >= 1 ? title : null;
}

export function validPid(raw: unknown): string | null {
  return typeof raw === "string" && /^[a-z0-9]{6,24}$/.test(raw) ? raw : null;
}
