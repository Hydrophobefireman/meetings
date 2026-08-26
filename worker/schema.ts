import { Schema } from "effect";

/** YYYY-MM-DD, and a real calendar date (rejects 2026-02-31 rollover). */
export const IsoDate = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.filter((s) => {
    const t = Date.parse(`${s}T00:00:00Z`);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
  }, { message: () => "not a real calendar date" }),
  Schema.annotations({ description: "ISO calendar date, e.g. 2026-09-01" }),
);

const Trimmed = (max: number) =>
  Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(max));

/** POST /api/events — { title, start, end } range or legacy { title, days[] } */
export const CreateEventBody = Schema.Union(
  Schema.Struct({ title: Trimmed(80), start: IsoDate, end: IsoDate }),
  Schema.Struct({
    title: Trimmed(80),
    days: Schema.Array(IsoDate).pipe(Schema.minItems(1), Schema.maxItems(20000)),
  }),
);

/** PUT /api/events/:id/me */
export const SaveResponseBody = Schema.Struct({
  name: Trimmed(40),
  pid: Schema.optional(Schema.String.pipe(Schema.pattern(/^[a-z0-9]{6,24}$/))),
  marks: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Union(Schema.Literal("free"), Schema.Literal("no")),
    }),
  ),
});
