import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Users, Trophy, Flame } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Dashboard — FireArena" }] }),
  component: HomePage,
});

function HomePage() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [t, m, r] = await Promise.all([
        supabase.from("teams").select("id", { count: "exact", head: true }),
        supabase.from("matches").select("id", { count: "exact", head: true }),
        supabase.from("match_results").select("id", { count: "exact", head: true }),
      ]);
      return { teams: t.count ?? 0, matches: m.count ?? 0, results: r.count ?? 0 };
    },
  });

  const recent = useQuery({
    queryKey: ["recent-matches"],
    queryFn: async () => {
      const { data } = await supabase.from("matches")
        .select("id,name,played_at").order("played_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-gradient-to-br from-card to-background border border-border p-6 md:p-10 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-gold mb-3">
            <Flame className="w-3.5 h-3.5" /> Tournament Command Center
          </div>
          <h1 className="text-3xl md:text-5xl font-display font-bold mb-2">Run your Free Fire league.</h1>
          <p className="text-muted-foreground max-w-xl">Upload match screenshots — we extract placements, kills, and player stats automatically. Track every squad across the season.</p>
          <Link to="/tournaments" className="inline-flex items-center gap-2 mt-6 bg-gradient-gold text-gold-foreground px-5 py-2.5 rounded-md font-semibold hover:opacity-90 shadow-glow">
            <Upload className="w-4 h-4" /> Start a tournament
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Teams" value={stats.data?.teams ?? 0} icon={Users} href="/teams" />
        <StatCard label="Matches Played" value={stats.data?.matches ?? 0} icon={Flame} href="/upload" />
        <StatCard label="Results Tracked" value={stats.data?.results ?? 0} icon={Trophy} href="/standings" />
      </div>

      <div>
        <h2 className="text-lg font-display font-semibold mb-3">Recent Matches</h2>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {(recent.data ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No matches yet — upload your first one.</div>
          )}
          {recent.data?.map(m => (
            <div key={m.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">{new Date(m.played_at).toLocaleString()}</div>
              </div>
              <Link to="/standings" className="text-sm text-gold hover:underline">View standings →</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, href }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; href: "/teams" | "/upload" | "/standings" }) {
  return (
    <Link to={href} className="rounded-xl border border-border bg-card p-5 hover:border-gold/50 transition group">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 text-gold" />
      </div>
      <div className="mt-2 text-3xl font-display font-bold group-hover:text-gold transition">{value}</div>
    </Link>
  );
}
