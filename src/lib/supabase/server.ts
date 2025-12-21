import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Server-side client with service role key (full access)
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Get storage bucket name
export const STORAGE_BUCKET = "photobooze-images";

// Helper to build storage paths
export function getOriginalPath(partyId: string, photoId: string, ext: string): string {
  return `parties/${partyId}/original/${photoId}.${ext}`;
}

export function getTvPath(partyId: string, photoId: string): string {
  return `parties/${partyId}/tv/${photoId}.jpg`;
}

export function getPartyFolder(partyId: string): string {
  return `parties/${partyId}`;
}
