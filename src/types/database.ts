// Re-export and alias the generated Supabase types
import type { Database } from './supabase';

export type PartyStatus = 'active' | 'closed';

// Table row types
export type Party = Database['public']['Tables']['parties']['Row'];
export type Uploader = Database['public']['Tables']['uploaders']['Row'];
export type Photo = Database['public']['Tables']['photos']['Row'];

// Temporary type for party_join_tokens until we regenerate Supabase types
export type PartyJoinToken = {
  id: string;
  party_id: string;
  token: string;
  created_at: string;
};

// Insert types
export type PartyInsert = Database['public']['Tables']['parties']['Insert'];
export type UploaderInsert = Database['public']['Tables']['uploaders']['Insert'];
export type PhotoInsert = Database['public']['Tables']['photos']['Insert'];

// Update types
export type PartyUpdate = Database['public']['Tables']['parties']['Update'];
export type UploaderUpdate = Database['public']['Tables']['uploaders']['Update'];
export type PhotoUpdate = Database['public']['Tables']['photos']['Update'];

// For API responses with joined data
export interface PhotoWithUploader extends Photo {
  uploader: Pick<Uploader, 'display_name'> | null;
}
