import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DEFAULT_PLACEMENT, type PlacementMap } from "@/lib/scoring";
import { RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — YCT PointMaker" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  useEffect(() => { supabase.auth.getUser().then(({data}) => setUserId(data.user?.id ?? "")); }, []);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("user_settings").select("*").maybeSingle()).data,
  });

  const [map, setMap] = useState<PlacementMap>(DEFAULT_PLACEMENT);
  const [killValue, setKillValue] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setMap((settings.data.placement_points as PlacementMap) ?? DEFAULT_PLACEMENT);
      setKillValue(settings.data.kill_point_value ?? 1);
    }
  }, [settings.data]);

  async function save() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("user_settings").upsert({
      user_id: userId, placement_points: map, kill_point_value: killValue, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Saved"); qc.invalidateQueries(); }
  }

  function reset() { setMap(DEFAULT_PLACEMENT); setKillValue(1); }

  const positions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
        <p className="text-muted-foreground">Customize scoring for your tournament format.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">Placement Points</h2>
          <button onClick={reset} className="text-xs text-muted-foreground hover:text-gold inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Reset to default</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {positions.map(p => (
            <div key={p} className="flex items-center gap-2">
              <div className="w-10 text-sm text-muted-foreground">#{p}</div>
              <Input type="number" value={map[String(p)] ?? 0}
                onChange={e => setMap({ ...map, [String(p)]: Number(e.target.value) || 0 })} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-display font-semibold text-lg mb-3">Kill Points</h2>
        <div className="flex items-center gap-3">
          <Label htmlFor="kv" className="w-32">Points per kill</Label>
          <Input id="kv" type="number" value={killValue} onChange={e => setKillValue(Number(e.target.value) || 0)} className="max-w-[120px]" />
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="bg-gradient-gold text-gold-foreground font-semibold">
        {saving ? "Saving…" : "Save settings"}
      </Button>

      <p className="text-xs text-muted-foreground">Settings apply to new matches. Past results retain their original scoring.</p>
    </div>
  );
}
