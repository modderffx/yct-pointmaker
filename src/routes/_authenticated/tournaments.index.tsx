import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Plus, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";
import { SERIES_MAPS, type SeriesType } from "@/lib/tournaments";

export const Route = createFileRoute("/_authenticated/tournaments/")({
  head: () => ({ meta: [{ title: "Tournaments — YCT PointMaker" }] }),
  component: TournamentsPage,
});

function TournamentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [series, setSeries] = useState<SeriesType>("3");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? ""));
  }, []);

  const list = useQuery({
    queryKey: ["tournaments"],
    queryFn: async () => {
      const { data } = await supabase.from("tournaments")
        .select("id,name,series_type,total_matches,maps,created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const matchCounts = useQuery({
    queryKey: ["tournament-match-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("matches").select("tournament_id");
      const counts = new Map<string, number>();
      for (const m of data ?? []) {
        if (!m.tournament_id) continue;
        counts.set(m.tournament_id, (counts.get(m.tournament_id) ?? 0) + 1);
      }
      return counts;
    },
  });

  async function handleCreate() {
    if (!name.trim()) { toast.error("Enter a tournament name"); return; }
    setCreating(true);
    try {
      const maps = SERIES_MAPS[series];
      const { data, error } = await supabase.from("tournaments").insert({
        user_id: userId,
        name: name.trim(),
        series_type: series,
        total_matches: maps.length,
        maps,
      }).select().single();
      if (error) throw error;
      toast.success("Tournament created");
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      setName("");
      navigate({ to: "/tournaments/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-2">
          <Trophy className="w-7 h-7 text-gold" /> Tournaments
        </h1>
        <p className="text-muted-foreground">Create a multi-match game day, then upload screenshots match-by-match.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-display font-semibold text-lg">New tournament</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
          <div>
            <Label htmlFor="tn">Tournament name</Label>
            <Input id="tn" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sunday Showdown · Week 3" />
          </div>
        </div>
        <div>
          <Label className="block mb-2">Series format</Label>
          <div className="grid sm:grid-cols-2 gap-3">
            {(["3", "5"] as SeriesType[]).map(s => {
              const active = series === s;
              const maps = Array.isArray(SERIES_MAPS[s]) ? SERIES_MAPS[s] : [];
              return (
                <button
                  key={s}

                  type="button"
                  onClick={() => setSeries(s)}
                  className={`text-left rounded-lg border p-4 transition ${active ? "border-gold bg-gold/10" : "border-border hover:border-gold/50"}`}
                >
                  <div className="font-display font-bold">{s}-Match Series</div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                    {maps.map(m => (
                      <span key={m} className="px-2 py-0.5 rounded-full bg-muted">{m}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <Button onClick={handleCreate} disabled={creating} className="bg-gradient-gold text-gold-foreground font-semibold">
          <Plus className="w-4 h-4 mr-1" /> {creating ? "Creating…" : "Create tournament"}
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="font-display font-semibold text-lg">Your tournaments</h2>
        {(list.data ?? []).length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No tournaments yet. Create one above to begin.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {list.data?.map(t => {
            const completed = matchCounts.data?.get(t.id) ?? 0;
            const maps = Array.isArray(t?.maps) ? t.maps : [];
            const totalMatches = t?.total_matches ?? maps.length ?? 0;
            const pct = totalMatches ? Math.min(100, Math.round((completed / totalMatches) * 100)) : 0;
            return (
              <Link
                key={t.id}
                to="/tournaments/$id"
                params={{ id: t.id }}
                className="rounded-xl border border-border bg-card p-5 hover:border-gold/50 transition block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display font-bold truncate">{t?.name ?? "Untitled"}</div>
                    <div className="text-xs text-muted-foreground">{t?.series_type ?? "?"}-match series · {t?.created_at ? new Date(t.created_at).toLocaleDateString() : ""}</div>
                  </div>
                  <span className="text-xs font-medium text-gold whitespace-nowrap">{completed}/{totalMatches}</span>

                </div>
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                  {maps.map((m, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded ${i < completed ? "bg-gold/20 text-gold" : "bg-muted"}`}>
                      <MapIcon className="inline w-3 h-3 mr-0.5" />{m}
                    </span>
                  ))}
                </div>

              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
