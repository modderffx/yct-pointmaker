import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Swords, Users, Trophy, Settings as SettingsIcon, LogOut, Grid3x3, Rocket, UserCog, Globe2, Shield, Plus, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import freeFireLogo from "@/assets/free-fire-logo.png.asset.json";
import { SkalorMark } from "@/components/SkalorMark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const moreNav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/tournaments", label: "Create Tournament", icon: Swords },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/profile", label: "Profile & Personalization", icon: UserCog },
  { to: "/slots", label: "Slots", icon: Grid3x3 },
  { to: "/standings", label: "Standings", icon: Trophy },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

type Workspace = "freefire" | "others";
const WORKSPACE_KEY = "skalor.workspace";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [workspace, setWorkspace] = useState<Workspace>("freefire");

  useEffect(() => {
    const saved = localStorage.getItem(WORKSPACE_KEY);
    if (saved === "others" || saved === "freefire") setWorkspace(saved);
  }, []);

  function selectWorkspace(next: Workspace) {
    setWorkspace(next);
    localStorage.setItem(WORKSPACE_KEY, next);
    if (next === "freefire" && pathname === "/") navigate({ to: "/home" });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const showFreeFire = workspace === "freefire";

  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar — brand pinned top-right */}
      <header className="fixed top-0 inset-x-0 z-30 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card/60 p-1">
            <button
              type="button"
              onClick={() => selectWorkspace("freefire")}
              aria-pressed={workspace === "freefire"}
              aria-label="Free Fire workspace"
              className={`flex items-center justify-center h-9 px-4 rounded-md text-xs font-semibold uppercase tracking-wider transition ${workspace === "freefire" ? "bg-gold text-gold-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <img src={freeFireLogo.url} alt="Free Fire" className="h-6 w-[70px] object-contain" />
            </button>
            <button
              type="button"
              onClick={() => selectWorkspace("others")}
              aria-pressed={workspace === "others"}
              className={`flex items-center justify-center h-9 px-4 min-w-[70px] rounded-md text-xs font-semibold uppercase tracking-wider transition ${workspace === "others" ? "bg-gold text-gold-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Others
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/home" className="flex items-center gap-2">
              <SkalorMark className="h-8 w-9" />
              <span className="font-display font-bold text-xl tracking-[0.18em] text-foreground">SKALOR</span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Settings menu"
                className="inline-flex flex-col items-center justify-center gap-[3px] w-9 h-9 rounded-full bg-gold shadow-glow hover:opacity-90 transition"
              >
                <span className="w-[3px] h-[3px] rounded-full bg-black" />
                <span className="w-[3px] h-[3px] rounded-full bg-black" />
                <span className="w-[3px] h-[3px] rounded-full bg-black" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Menu</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {moreNav.map(item => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link to={item.to} className="flex items-center gap-2 cursor-pointer">
                        <Icon className="w-4 h-4 text-gold" /> {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="pt-16 pb-28">
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          {showFreeFire ? children : <ComingSoon />}
        </div>
      </main>

      {showFreeFire && (
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border">
          <div className="max-w-6xl mx-auto relative flex items-end justify-between px-6 h-16">
            <button
              type="button"
              onClick={() => toast("Coming Soon", { description: "Team spaces are on the way." })}
              className="flex flex-col items-center justify-center py-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
            >
              <Shield className="w-5 h-5 mb-0.5" />
              Your Team
            </button>

            <Link
              to="/tournaments"
              aria-label="Create tournament"
              className="absolute left-1/2 -translate-x-1/2 -top-7 w-14 h-14 rounded-full bg-gold flex items-center justify-center shadow-glow ring-4 ring-background hover:opacity-90 transition"
            >
              <Plus className="w-7 h-7 text-white" strokeWidth={3} />
            </Link>

            <div className="flex items-end gap-8">
              <Link
                to="/community"
                className={`flex flex-col items-center justify-center py-2 text-[10px] uppercase tracking-wider transition ${pathname === "/community" ? "text-gold" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Globe2 className="w-5 h-5 mb-0.5" />
                Tournaments
              </Link>
              <Link
                to="/profile"
                className={`flex flex-col items-center justify-center py-2 text-[10px] uppercase tracking-wider transition ${pathname === "/profile" ? "text-gold" : "text-muted-foreground hover:text-foreground"}`}
              >
                <UserCog className="w-5 h-5 mb-0.5" />
                Profile
              </Link>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-gold flex items-center justify-center mb-6 shadow-glow">
          <Rocket className="w-8 h-8 text-gold-foreground" />
        </div>
        <div className="text-xs uppercase tracking-widest text-gold mb-2">Other Games</div>
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Coming Soon</h1>
        <p className="text-muted-foreground">
          Support for games like <span className="text-foreground font-medium">Call of Duty</span> and{" "}
          <span className="text-foreground font-medium">PUBG</span> is on the way. Stay tuned — the arena is expanding.
        </p>
      </div>
    </div>
  );
}
