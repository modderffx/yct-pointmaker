import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TeamSchema = z.object({
  position: z.number().int().min(1).max(20),
  team_name: z.string().optional().default(""),
  players: z.array(z.string()).default([]),
  kills: z.array(z.number().int().min(0)).default([]),
  totalKills: z.number().int().min(0).default(0),
});

const ResultSchema = z.object({
  teams: z.array(TeamSchema),
});

export type OcrTeam = z.infer<typeof TeamSchema>;
export type OcrResult = z.infer<typeof ResultSchema>;

const SYSTEM_PROMPT = `You are a Gemini Vision OCR engine specialized in Free Fire tournament result screenshots.
Extract every team visible across the provided screenshots.

Return JSON ONLY (no prose, no markdown) matching this EXACT shape:
{
  "teams": [
    {
      "position": 1,
      "team_name": "SLC",
      "players": ["SLC PANDASR", "SLC RANIYASR", "SLC Mr.Sani", "SLC THARuuSR"],
      "kills": [5, 5, 5, 6],
      "totalKills": 21
    }
  ]
}

Rules:
- position = team finishing rank (1 = best / WWCD).
- players = array of in-game names (IGNs) in display order.
- kills = array of individual eliminations, SAME order and SAME length as players.
- totalKills = sum of the team's eliminations as shown on screen.
- team_name = the team tag/clan shown (e.g. "SLC"). Empty string if none visible.
- If the same team appears in multiple screenshots, merge into ONE entry (do not duplicate).
- Use the exact text from the screenshot. Do not invent players or teams.`;

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
      { type: "text", text: "Extract all Free Fire match results from these screenshots. Return JSON only matching the specified schema." },
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
      throw new Error(`Gemini OCR failed (${resp.status}): ${txt.slice(0, 200)}`);
    }

    const body = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { teams: [] };
    }

    // Normalize: pad/truncate kills array to match players length, recompute totalKills if missing
    const safe = ResultSchema.safeParse(parsed);
    if (!safe.success) return { teams: [] as OcrTeam[] };

    const teams = safe.data.teams.map(t => {
      const players = t.players;
      const kills = players.map((_, i) => t.kills[i] ?? 0);
      const totalKills = t.totalKills || kills.reduce((a, b) => a + b, 0);
      return { ...t, players, kills, totalKills };
    }).sort((a, b) => a.position - b.position);

    return { teams };
  });
