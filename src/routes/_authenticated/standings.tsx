import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/standings")({
  head: () => ({ meta: [{ title: "Standings — FireArena" }] }),
  component: StandingsPage,
});

type Row = {
  team_id: string | null; team_name: string; logo_url: string | null;
  matches: number; placement_points: number; kill_points: number; kills: number; total: number;
  wins: number;
};

function StandingsPage() {
  const data = useQuery({
    queryKey: ["standings"],
    queryFn: async () => {
      const { data: results } = await supabase
        .from("match_results")
        .select("team_id,team_name_raw,placement,kills,placement_points,kill_points,total_points,team:teams(name,logo_url)");
      return results ?? [];
    },
  });

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of data.data ?? []) {
      const key = r.team_id ?? `raw:${r.team_name_raw}`;
      const team = r.team as { name: string; logo_url: string | null } | null;
      const existing = map.get(key) ?? {
        team_id: r.team_id, team_name: team?.name ?? r.team_name_raw, logo_url: team?.logo_url ?? null,
        matches: 0, placement_points: 0, kill_points: 0, kills: 0, total: 0, wins: 0,
      };
      existing.matches += 1;
      existing.placement_points += r.placement_points;
      existing.kill_points += r.kill_points;
      existing.kills += r.kills;
      existing.total += r.total_points;
      if (r.placement === 1) existing.wins += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total || b.wins - a.wins || b.kills - a.kills);
  }, [data.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-2"><Trophy className="w-7 h-7 text-gold" /> Standings</h1>
        <p className="text-muted-foreground">Aggregated across all saved matches.</p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Team</div>
          <div className="col-span-1 text-right">M</div>
          <div className="col-span-1 text-right">W</div>
          <div className="col-span-1 text-right">K</div>
          <div className="col-span-2 text-right">Place</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No matches scored yet.</div>
        )}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-muted/30">
            <div className={`col-span-1 font-display font-bold ${i===0?"text-gold text-xl":i<3?"text-gold/80":""}`}>{i + 1}</div>
            <div className="col-span-4 font-medium truncate">{r.team_name}</div>
            <div className="col-span-1 text-right text-sm text-muted-foreground">{r.matches}</div>
            <div className="col-span-1 text-right text-sm text-muted-foreground">{r.wins}</div>
            <div className="col-span-1 text-right text-sm">{r.kills}</div>
            <div className="col-span-2 text-right text-sm">{r.placement_points}</div>
            <div className="col-span-2 text-right font-display font-bold text-gold">{r.total}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
