import { createServerFn } from "@tanstack/react-start";

/**
 * The Claude-written trading review. A server function (runs in the Node process
 * behind TanStack Start / `npm run preview` / `node .output/server`) sends a
 * plain-text brief of the imported dataset to Claude and gets back a structured
 * review that drops straight into the journal UI.
 *
 * Requires ANTHROPIC_API_KEY in the server environment. When it is missing the
 * function throws `no-key` and the UI falls back to the built-in heuristic
 * review — the app keeps working offline exactly as before.
 */

export type CoachReview = {
  grade: string;
  score: number;
  summary: string;
  sections: { heading: string; tone: "good" | "bad" | "neutral"; items: string[] }[];
};

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["grade", "score", "summary", "sections"],
  properties: {
    grade: { type: "string", description: "Letter grade A+ … F for the account overall" },
    score: { type: "number", description: "0–100 score behind the grade" },
    summary: {
      type: "string",
      description: "Two or three sentences: the headline read on this trader",
    },
    sections: {
      type: "array",
      description: "3–5 sections, e.g. What's working / What's costing you / Do this next",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "tone", "items"],
        properties: {
          heading: { type: "string" },
          tone: { type: "string", enum: ["good", "bad", "neutral"] },
          items: {
            type: "array",
            items: { type: "string" },
            description: "Punchy, specific, one idea per line",
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are a veteran trading-desk head reviewing a trader's imported broker history.
You are given a factual brief: aggregate stats, a heuristic engine's findings, per-day P&L, and per-ticker P&L.

Write a sharp, specific review in the trader's own numbers. Rules:
- Every claim ties to a figure in the brief. No generic advice.
- Call out what is genuinely working before what is costing them.
- "Do this next" must be 2–3 concrete, testable changes — not platitudes.
- Plain desk language, no hedging, no disclaimers. Not financial advice, and you don't need to say so.
- If the sample is small, say the read is provisional and keep it short.
Keep the whole thing tight — a trader reads this in under a minute.`;

type Args = { brief: string };

export const generateCoachReview = createServerFn({ method: "POST" })
  .validator((d: Args): Args => ({ brief: String(d.brief).slice(0, 60_000) }))
  .handler(async ({ data }): Promise<CoachReview> => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("no-key");

    const [{ default: Anthropic }, { jsonSchemaOutputFormat }] = await Promise.all([
      import("@anthropic-ai/sdk"),
      import("@anthropic-ai/sdk/helpers/json-schema"),
    ]);

    const client = new Anthropic({ apiKey });
    const res = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 8_000,
      output_config: { effort: "medium", format: jsonSchemaOutputFormat(REVIEW_SCHEMA) },
      system: SYSTEM,
      messages: [{ role: "user", content: data.brief }],
    });

    const review = res.parsed_output as CoachReview | null;
    if (!review) throw new Error("Claude returned a review that could not be parsed");
    return review;
  });
