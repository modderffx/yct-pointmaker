import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserCog, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { THEME_LIST, type ThemeKey } from "@/lib/standings-themes";
import {
  DEFAULT_BRAND_PROFILE,
  fileToDataUrl,
  loadBrandProfile,
  saveBrandProfile,
  type BrandProfile,
} from "@/lib/brand-profile";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile & Branding — RampageForge" },
      { name: "description", content: "Save your organization name, season tag, logo and default sheet theme so every new point sheet matches your brand." },
      { property: "og:title", content: "Profile & Branding — RampageForge" },
      { property: "og:description", content: "Set global branding defaults for RampageForge point sheets and standings graphics." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const [profile, setProfile] = useState<BrandProfile>(DEFAULT_BRAND_PROFILE);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setProfile(loadBrandProfile()); }, []);

  function patch(p: Partial<BrandProfile>) {
    setProfile(prev => {
      const next = { ...prev, ...p };
      saveBrandProfile(next);
      return next;
    });
  }

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be smaller than 2 MB"); return; }
    try {
      patch({ logoDataUrl: await fileToDataUrl(file) });
      toast.success("Logo saved — it will appear on new standings graphics");
    } catch {
      toast.error("Could not read that image");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-gold flex items-center justify-center shadow-glow">
          <UserCog className="w-5 h-5 text-gold-foreground" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-gold">Personalization</div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Profile &amp; Branding</h1>
        </div>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        These defaults auto-fill every new point sheet and standings graphic. You can still edit any sheet manually.
      </p>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="font-display font-semibold">Brand details</div>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Organization / Brand name (Text 1)</span>
            <Input value={profile.orgName} onChange={e => patch({ orgName: e.target.value })} placeholder="YCT Esports" />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Default subtitle / season tag (Text 2)</span>
            <Input value={profile.subtitle} onChange={e => patch({ subtitle: e.target.value })} placeholder="Season 4 — Grand Finals" />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="font-display font-semibold">Organization logo</div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
            {profile.logoDataUrl
              ? <img src={profile.logoDataUrl} alt="Organization logo" className="w-full h-full object-contain" />
              : <span className="text-[10px] text-muted-foreground text-center px-2">No logo</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => void onPickLogo(e.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Upload logo
            </Button>
            {profile.logoDataUrl && (
              <Button variant="ghost" className="text-destructive" onClick={() => patch({ logoDataUrl: null })}>
                <Trash2 className="w-4 h-4 mr-2" /> Remove
              </Button>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">PNG, JPG or WebP up to 2 MB. Attached to all newly generated standings graphics.</div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div>
          <div className="font-display font-semibold">Default sheet theme &amp; colors</div>
          <div className="text-xs text-muted-foreground">New point sheets start with this theme and canvas background.</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {THEME_LIST.map(t => {
            const active = t.key === (profile.themeKey as ThemeKey);
            return (
              <button
                key={t.key}
                onClick={() => patch({ themeKey: t.key })}
                className={`text-left rounded-lg border p-3 transition ${active ? "border-gold ring-2 ring-gold/40" : "border-border hover:border-gold/40"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md flex-shrink-0" style={{ background: t.swatch }} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <label className="space-y-1 block max-w-xs">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Canvas background color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={profile.bg}
              onChange={e => patch({ bg: e.target.value })}
              className="h-9 w-12 rounded-md border border-border bg-transparent cursor-pointer"
            />
            <Input value={profile.bg} onChange={e => patch({ bg: e.target.value })} className="h-9 flex-1 font-mono text-xs" />
          </div>
        </label>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => { saveBrandProfile(profile); toast.success("Branding defaults saved"); }}>Save defaults</Button>
        <Button
          variant="outline"
          onClick={() => { setProfile(DEFAULT_BRAND_PROFILE); saveBrandProfile(DEFAULT_BRAND_PROFILE); toast.success("Reset to defaults"); }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
