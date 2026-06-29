import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Download, Shield } from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";

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
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

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

  const handleExport = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      // Resolve logo URLs to data URIs to avoid CORS taints
      const node = exportRef.current;
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0b0c10",
      });
      const link = document.createElement("a");
      link.download = "tournament-standings-overall.png";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  const top12 = rows.slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2"><Trophy className="w-7 h-7 text-gold" /> Standings</h1>
          <p className="text-muted-foreground">Aggregated across all saved matches.</p>
        </div>
        <Button onClick={handleExport} disabled={exporting || rows.length === 0} className="bg-gold text-black hover:bg-gold/90 font-display">
          <Download className="w-4 h-4 mr-2" />
          {exporting ? "Exporting…" : "Export Standings"}
        </Button>
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

      {/* Off-screen export canvas */}
      <div style={{ position: "fixed", left: "-10000px", top: 0, pointerEvents: "none" }} aria-hidden>
        <ExportCard ref={exportRef} rows={top12} />
      </div>
    </div>
  );
}

const PODIUM = [
  { bg: "linear-gradient(90deg, rgba(255,196,0,0.28), rgba(255,196,0,0.04))", border: "#f4c542", glow: "0 0 24px rgba(244,197,66,0.35)" },
  { bg: "linear-gradient(90deg, rgba(210,210,220,0.22), rgba(210,210,220,0.03))", border: "#c8cdd6", glow: "0 0 18px rgba(200,205,214,0.25)" },
  { bg: "linear-gradient(90deg, rgba(205,127,50,0.24), rgba(205,127,50,0.03))", border: "#cd7f32", glow: "0 0 18px rgba(205,127,50,0.28)" },
];

const ExportCard = ({ ref, rows }: { ref: React.Ref<HTMLDivElement>; rows: Row[] }) => {
  // Pad to 12 visual slots so layout is consistent
  const slots: (Row | null)[] = Array.from({ length: 12 }, (_, i) => rows[i] ?? null);

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1920,
        background:
          "radial-gradient(900px 600px at 0% 0%, rgba(168,85,247,0.22), transparent 60%), radial-gradient(900px 600px at 100% 0%, rgba(236,72,153,0.18), transparent 60%), radial-gradient(900px 700px at 50% 100%, rgba(20,184,166,0.14), transparent 60%), #0b0c10",
        color: "#fff",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "72px 64px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg,#ef4444,#f59e0b)", display: "grid", placeItems: "center", boxShadow: "0 0 30px rgba(239,68,68,0.5)" }}>
            <Trophy size={32} color="#0b0c10" strokeWidth={2.5} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: "#2dd4bf", textTransform: "uppercase" }}>
            FireArena Tournament
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 6 }}>
          <div style={{ height: 6, width: 80, background: "linear-gradient(90deg,#ef4444,#f59e0b)", borderRadius: 4 }} />
          <h1 style={{ fontSize: 80, lineHeight: 1, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
            Overall Standings
          </h1>
        </div>
        <div style={{ fontSize: 18, color: "#9ca3af", marginTop: 6, letterSpacing: 1 }}>
          Top 12 squads · Ranked by total points
        </div>
      </div>

      {/* Column Header */}
      <div
        style={{
          marginTop: 48,
          display: "grid",
          gridTemplateColumns: "80px 1fr 110px 110px 140px 160px",
          alignItems: "center",
          padding: "16px 24px",
          fontSize: 16,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 2,
          color: "#9ca3af",
          borderBottom: "2px solid rgba(255,255,255,0.08)",
        }}
      >
        <div>Rank</div>
        <div>Squad</div>
        <div style={{ textAlign: "right" }}>Match</div>
        <div style={{ textAlign: "right" }}>Kills</div>
        <div style={{ textAlign: "right" }}>Placement</div>
        <div style={{ textAlign: "right" }}>Total</div>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, flex: 1 }}>
        {slots.map((r, i) => {
          const podium = i < 3 ? PODIUM[i] : null;
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 110px 110px 140px 160px",
                alignItems: "center",
                padding: "14px 24px",
                background: podium ? podium.bg : "rgba(255,255,255,0.025)",
                borderLeft: podium ? `4px solid ${podium.border}` : "4px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                boxShadow: podium ? podium.glow : "none",
                minHeight: 72,
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 900,
                  fontFamily: "'Inter', sans-serif",
                  color: podium ? podium.border : "#fff",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
                <div
                  style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: "linear-gradient(135deg, #1f2937, #111827)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden",
                  }}
                >
                  {r?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logo_url} alt="" width={48} height={48} style={{ objectFit: "cover" }} crossOrigin="anonymous" />
                  ) : (
                    <Shield size={26} color="#6b7280" />
                  )}
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: r ? "#fff" : "#3f3f46",
                  }}
                >
                  {r?.team_name ?? "—"}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, color: "#d1d5db" }}>{r?.matches ?? 0}</div>
              <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, color: "#fca5a5" }}>{r?.kills ?? 0}</div>
              <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, color: "#2dd4bf" }}>{r?.placement_points ?? 0}</div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 30,
                  fontWeight: 900,
                  color: "#f4c542",
                  textShadow: "0 0 12px rgba(244,197,66,0.45)",
                }}
              >
                {r?.total ?? 0}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 32,
          padding: "20px 24px",
          borderRadius: 12,
          background: "linear-gradient(90deg, rgba(168,85,247,0.15), rgba(236,72,153,0.1))",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 16,
          letterSpacing: 1,
        }}
      >
        <div style={{ textTransform: "uppercase", fontWeight: 700, color: "#e5e7eb" }}>
          Generated automatically by FireArena AI
        </div>
        <div style={{ color: "#9ca3af" }}>firearena.app</div>
      </div>
    </div>
  );
};
