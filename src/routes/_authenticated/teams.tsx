import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Shield, Pencil, X, Users } from "lucide-react";
import { toast } from "sonner";
import { uploadTeamLogo, getLogoUrl } from "@/lib/teams";

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  aliases: string[];
  players: string[];
};

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Teams — YCT PointMaker" }] }),
  component: TeamsPage,
});

function TeamsPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  useEffect(() => { supabase.auth.getUser().then(({data}) => setUserId(data.user?.id ?? "")); }, []);

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await supabase.from("teams").select("*").order("name")).data ?? [],
  });

  async function handleDelete(id: string) {
    if (!confirm("Delete this team? Past match results will keep raw team names but unlink.")) return;
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Team deleted"); qc.invalidateQueries(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Teams</h1>
          <p className="text-muted-foreground">Registered squads. Future matches recognize them automatically.</p>
        </div>
        <CreateTeamDialog userId={userId} onCreated={() => qc.invalidateQueries({ queryKey: ["teams"] })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.data?.map(t => (
          <TeamCard
            key={t.id}
            team={t as Team}
            onDelete={() => handleDelete(t.id)}
            onSaved={() => qc.invalidateQueries({ queryKey: ["teams"] })}
          />
        ))}
        {teams.data?.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12 border border-dashed border-border rounded-xl">
            No teams yet. Add one or upload a match and we'll register them as they appear.
          </div>
        )}
      </div>
    </div>
  );
}

function TeamCard({ team, onDelete, onSaved }: { team: Team; onDelete: () => void; onSaved: () => void }) {
  const [logo, setLogo] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => { getLogoUrl(team.logo_url).then(setLogo); }, [team.logo_url]);
  return (
    <div className="rounded-xl border border-border bg-card p-5 group hover:border-gold/40 transition">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-lg bg-muted border border-border overflow-hidden flex items-center justify-center shrink-0">
          {logo ? <img src={logo} alt={team.name} className="w-full h-full object-cover" /> : <Shield className="w-6 h-6 text-gold" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold truncate">{team.name}</div>
          {team.aliases.length > 0 && (
            <div className="text-xs text-muted-foreground truncate">a.k.a. {team.aliases.join(", ")}</div>
          )}
          <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
            <Users className="w-3 h-3 text-gold" /> {team.players?.length ?? 0} players
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={() => setEditOpen(true)}
            title="Edit team"
            className="text-muted-foreground hover:text-gold p-1"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete team"
            className="text-muted-foreground hover:text-destructive p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {team.players?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {team.players.slice(0, 6).map((p, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-muted border border-border text-foreground/80">
              {p}
            </span>
          ))}
          {team.players.length > 6 && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted border border-border text-muted-foreground">
              +{team.players.length - 6}
            </span>
          )}
        </div>
      )}

      <EditTeamDialog open={editOpen} onOpenChange={setEditOpen} team={team} onSaved={onSaved} />
    </div>
  );
}

function EditTeamDialog({ open, onOpenChange, team, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; team: Team; onSaved: () => void }) {
  const [name, setName] = useState(team.name);
  const [players, setPlayers] = useState<string[]>(team.players ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(team.name);
      setPlayers(team.players ?? []);
    }
  }, [open, team]);

  function updatePlayer(i: number, val: string) {
    setPlayers(p => p.map((x, idx) => (idx === i ? val : x)));
  }
  function removePlayer(i: number) {
    setPlayers(p => p.filter((_, idx) => idx !== i));
  }
  function addPlayer() {
    setPlayers(p => [...p, ""]);
  }

  async function save() {
    if (!name.trim()) { toast.error("Team name required"); return; }
    setBusy(true);
    try {
      const cleaned = players.map(p => p.trim()).filter(Boolean);
      const { error } = await supabase.from("teams")
        .update({ name: name.trim(), players: cleaned })
        .eq("id", team.id);
      if (error) throw error;
      toast.success("Team updated");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update team");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit team</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="etn">Team name</Label>
            <Input id="etn" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Player in-game names</Label>
              <Button type="button" size="sm" variant="outline" onClick={addPlayer}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add player
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Update IGNs whenever players change their names in-game.</p>
            <div className="space-y-2">
              {players.length === 0 && (
                <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3 text-center">
                  No players yet. Add IGNs so future match uploads auto-match this team.
                </div>
              )}
              {players.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-muted border border-border text-[11px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                  <Input value={p} onChange={e => updatePlayer(i, e.target.value)} placeholder="Player IGN" />
                  <button
                    type="button"
                    onClick={() => removePlayer(i)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Remove player"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-gradient-gold text-gold-foreground font-semibold">
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

