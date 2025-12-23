// Re-export and alias the generated Supabase types
import type { Database } from './supabase';

export type PartyStatus = 'active' | 'closed';

// Base party type without admin PIN (for backward compatibility)
export type PartyBase = Omit<Database['public']['Tables']['parties']['Row'], 'admin_pin_hash'>;

// Party with optional admin PIN (for environments where migration may not be applied)
export type PartyWithOptionalPin = PartyBase & {
  admin_pin_hash?: string | null;
};

// Party with required admin PIN field (for environments with migration applied)
export type PartyWithPin = PartyBase & {
  admin_pin_hash: string | null;
};

// Default party type - use the one with optional PIN for safety
export type Party = PartyWithOptionalPin;

// Legacy alias to the generated type (when you're sure the migration is applied)
export type PartyFull = Database['public']['Tables']['parties']['Row'];

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
export type PartyInsert = Omit<Database['public']['Tables']['parties']['Insert'], 'admin_pin_hash'> & {
  admin_pin_hash?: string | null;
};
export type UploaderInsert = Database['public']['Tables']['uploaders']['Insert'];
export type PhotoInsert = Database['public']['Tables']['photos']['Insert'];

// Update types  
export type PartyUpdate = Omit<Database['public']['Tables']['parties']['Update'], 'admin_pin_hash'> & {
  admin_pin_hash?: string | null;
};
export type UploaderUpdate = Database['public']['Tables']['uploaders']['Update'];
export type PhotoUpdate = Database['public']['Tables']['photos']['Update'];

// For API responses with joined data
export interface PhotoWithUploader extends Photo {
  uploader: Pick<Uploader, 'display_name'> | null;
}

// Type guards and utilities for admin PIN handling
export function hasAdminPinSupport(party: PartyWithOptionalPin): party is PartyWithPin {
  return 'admin_pin_hash' in party;
}

export function getAdminPinHash(party: PartyWithOptionalPin): string | null | undefined {
  return hasAdminPinSupport(party) ? party.admin_pin_hash : undefined;
}

export function requiresPin(party: PartyWithOptionalPin): boolean {
  const pinHash = getAdminPinHash(party);
  return pinHash !== undefined && pinHash !== null;
}
