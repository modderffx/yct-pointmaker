import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ResultSchema = z.object({
  teams: z.array(z.object({
    team_name: z.string(),
    placement: z.number().int().min(1).max(20),
    total_kills: z.number().int().min(0).default(0),
    players: z.array(z.object({
      name: z.string(),
      kills: z.number().int().min(0).default(0),
    })).default([]),
  })),
});

const SYSTEM_PROMPT = `You are an OCR engine specialized in Free Fire tournament result screenshots.
Extract every team visible across the provided screenshots. Return JSON only matching this exact shape:
{"teams":[{"team_name":string,"placement":number,"total_kills":number,"players":[{"name":string,"kills":number}]}]}
- placement = team finishing position (1 = best).
- total_kills = total team eliminations.
- players = list of player IGNs with their individual kills if visible. Empty array if not visible.
- If the same team appears in both screenshots, merge them (do not duplicate).
- Use the team name/tag shown in the screenshot exactly. Do not invent teams.`;

export const extractMatchFromScreenshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    return z.object({
      images: z.array(z.object({
        data_url: z.string().startsWith("data:image/"),
      })).min(1).max(4),
    }).parse(input);
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: "Extract all Free Fire match results from these screenshots. Return JSON only." },
      ...data.images.map(img => ({ type: "image_url", image_url: { url: img.data_url } })),
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      if (resp.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable workspace settings.");
      throw new Error(`AI OCR failed (${resp.status}): ${txt.slice(0, 200)}`);
    }

    const body = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // try to salvage JSON inside
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { teams: [] };
    }
    const result = ResultSchema.safeParse(parsed);
    if (!result.success) {
      return { teams: [] as Array<z.infer<typeof ResultSchema>["teams"][number]> };
    }
    return result.data;
  });
