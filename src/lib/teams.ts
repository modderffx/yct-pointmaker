import { supabase } from "@/integrations/supabase/client";

export async function uploadTeamLogo(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("team-logos").upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type,
  });
  if (error) throw error;
  return path;
}

export async function getLogoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("team-logos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
