export type PartyStatus = "active" | "closed";

export interface Party {
  id: string;
  created_at: string;
  status: PartyStatus;
  closed_at: string | null;
  join_token_hash: string;
}

export interface Uploader {
  id: string;
  party_id: string;
  created_at: string;
  display_name: string | null;
}

export interface Photo {
  id: string;
  party_id: string;
  uploader_id: string;
  created_at: string;
  original_path: string;
  tv_path: string;
  original_mime: string | null;
  tv_mime: string | null;
  original_bytes: number | null;
  tv_bytes: number | null;
  comment: string | null;
}

// For API responses with joined data
export interface PhotoWithUploader extends Photo {
  uploader: Pick<Uploader, "display_name"> | null;
}

// Insert types (without auto-generated fields)
export interface PartyInsert {
  id?: string;
  status?: PartyStatus;
  join_token_hash: string;
}

export interface UploaderInsert {
  id?: string;
  party_id: string;
  display_name?: string | null;
}

export interface PhotoInsert {
  id?: string;
  party_id: string;
  uploader_id: string;
  original_path: string;
  tv_path: string;
  original_mime?: string | null;
  tv_mime?: string | null;
  original_bytes?: number | null;
  tv_bytes?: number | null;
  comment?: string | null;
}

// Supabase Database type definition
export interface Database {
  public: {
    Tables: {
      parties: {
        Row: Party;
        Insert: PartyInsert;
        Update: Partial<PartyInsert> & { closed_at?: string | null };
      };
      uploaders: {
        Row: Uploader;
        Insert: UploaderInsert;
        Update: Partial<UploaderInsert>;
      };
      photos: {
        Row: Photo;
        Insert: PhotoInsert;
        Update: Partial<PhotoInsert>;
      };
    };
  };
}
