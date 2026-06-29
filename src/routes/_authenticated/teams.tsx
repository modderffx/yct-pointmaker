import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";
import { uploadTeamLogo, getLogoUrl } from "@/lib/teams";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Teams — FireArena" }] }),
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
        {teams.data?.map(t => <TeamCard key={t.id} team={t} onDelete={() => handleDelete(t.id)} />)}
        {teams.data?.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12 border border-dashed border-border rounded-xl">
            No teams yet. Add one or upload a match and we'll register them as they appear.
          </div>
        )}
      </div>
    </div>
  );
}

function TeamCard({ team, onDelete }: { team: { id: string; name: string; short_name: string | null; logo_url: string | null; aliases: string[] }; onDelete: () => void }) {
  const [logo, setLogo] = useState<string | null>(null);
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
        </div>
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function CreateTeamDialog({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      let logoPath: string | null = null;
      if (file) logoPath = await uploadTeamLogo(userId, file);
      const { error } = await supabase.from("teams").insert({ user_id: userId, name: name.trim(), logo_url: logoPath });
      if (error) throw error;
      toast.success("Team added");
      setName(""); setFile(null); setOpen(false); onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-gold text-gold-foreground font-semibold"><Plus className="w-4 h-4 mr-1" /> Add Team</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Register a team</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="tn">Full team name</Label>
            <Input id="tn" value={name} onChange={e => setName(e.target.value)} placeholder="Total Gaming Esports" />
          </div>
          <div>
            <Label>Team logo</Label>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block text-sm mt-1" />
          </div>
          <Button onClick={save} disabled={busy} className="w-full bg-gradient-gold text-gold-foreground font-semibold">
            {busy ? "Saving…" : "Save team"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
