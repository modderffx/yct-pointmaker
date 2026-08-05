import type { ThemeKey } from "./standings-themes";

export type BrandProfile = {
  orgName: string;
  subtitle: string;
  logoDataUrl: string | null;
  themeKey: ThemeKey;
  bg: string;
};

export const BRAND_PROFILE_LS = "rankforge.brandProfile";

export const DEFAULT_BRAND_PROFILE: BrandProfile = {
  orgName: "OVERALL STANDINGS",
  subtitle: "RANKFORGE TOURNAMENT",
  logoDataUrl: null,
  themeKey: "rankforge-default",
  bg: "#ffffff",
};

export function loadBrandProfile(): BrandProfile {
  if (typeof window === "undefined") return DEFAULT_BRAND_PROFILE;
  try {
    const raw = window.localStorage.getItem(BRAND_PROFILE_LS);
    if (raw) return { ...DEFAULT_BRAND_PROFILE, ...(JSON.parse(raw) as Partial<BrandProfile>) };
  } catch { /* ignore */ }
  return DEFAULT_BRAND_PROFILE;
}

export function saveBrandProfile(profile: BrandProfile) {
  try { window.localStorage.setItem(BRAND_PROFILE_LS, JSON.stringify(profile)); } catch { /* ignore */ }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image file"));
    reader.readAsDataURL(file);
  });
}
