import type { MarkState } from "@/domain";

export interface EventMeta {
  readonly id: string;
  readonly title: string;
  readonly days: readonly string[];
  readonly created: number;
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
  if (
    new Date(t1).toISOString().slice(0, 10) !== start ||
    new Date(t2).toISOString().slice(0, 10) !== end
  ) {
    return null;
  }
  const days: string[] = [];
  for (let t = t1; t <= t2; t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10));
    if (days.length > 20000) return null;
  }
  return days;
}

export function normalizeDays(raw: {
  readonly start?: string | undefined;
  readonly end?: string | undefined;
  readonly days?: readonly string[] | undefined;
}): string[] | null {
  if (typeof raw.start === "string" && typeof raw.end === "string") {
    return expandRange(raw.start, raw.end);
  }
  if (Array.isArray(raw.days)) {
    const uniq = new Set<string>();
    for (const d of raw.days) {
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
  return null;
}

export function normalizeMarks(
  meta: EventMeta,
  raw: Readonly<Record<string, MarkState>>,
): Record<string, MarkState> {
  const out: Record<string, MarkState> = {};
  const allowed = new Set(meta.days);
  for (const [k, v] of Object.entries(raw)) {
    if (allowed.has(k) && (v === "free" || v === "no")) {
      out[k] = v;
    }
  }
  return out;
}

export function cleanName(raw: string): string | null {
  const name = raw.trim().slice(0, 40);
  return name.length >= 1 ? name : null;
}

export function cleanTitle(raw: string): string | null {
  const title = raw.trim().slice(0, 80);
  return title.length >= 1 ? title : null;
}

export function validPid(raw: string | undefined): string | null {
  return typeof raw === "string" && /^[a-z0-9]{6,24}$/.test(raw) ? raw : null;
}
