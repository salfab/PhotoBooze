# PhotoBooze 📷🎉

A party photo sharing app where guests scan a QR code to upload photos, which are displayed live on a TV slideshow.

## Features

- **Host creates a party** → Gets a QR code to share with guests
- **Guests scan QR** → Enter their name and start uploading photos
- **Client-side processing** → HEIC/HEIF conversion + resize for TV (1920px)
- **Live TV slideshow** → Supabase Realtime updates
- **Download all photos** → ZIP archive of originals
- **Delete party** → Removes all photos and data

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, MUI, CSS Modules
- **Backend**: Supabase (Postgres + Storage + Realtime)
- **Auth**: JWT session cookies (jose)
- **Image Processing**: heic2any, canvas resize (client-side)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker (for local Supabase)

### Local Development

1. **Clone and install**:
   ```bash
   git clone <repo>
   cd PhotoBooze
   pnpm install
   ```

2. **Start Supabase** (requires Docker):
   ```bash
   npx supabase start
   ```
   Copy the output credentials to `.env.local`.

3. **Create `.env.local`**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   SESSION_SECRET=<32-char-random-string>
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Run dev server**:
   ```bash
   pnpm dev
   ```

5. **Open** http://localhost:3000/admin to create a party

## Routes

| Route | Description |
|-------|-------------|
| `/` | Home page |
| `/admin` | Create and manage parties |
| `/join/[partyId]?token=...` | Guest join page (from QR) |
| `/upload/[partyId]` | Photo upload page |
| `/tv/[partyId]` | TV slideshow display |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/parties` | POST | Create new party |
| `/api/parties/[id]` | GET | Get party details |
| `/api/parties/[id]` | PATCH | Close party |
| `/api/parties/[id]` | DELETE | Delete party and all photos |
| `/api/parties/[id]/download` | GET | Download photos as ZIP |
| `/api/join` | POST | Join party as guest |
| `/api/photos` | POST | Upload photo (multipart) |

## Database Schema

```sql
-- parties: Party sessions
CREATE TABLE parties (
  id UUID PRIMARY KEY,
  status TEXT DEFAULT 'active', -- 'active' | 'closed'
  join_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- uploaders: Guest records
CREATE TABLE uploaders (
  id UUID PRIMARY KEY,
  party_id UUID REFERENCES parties(id),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- photos: Uploaded photos
CREATE TABLE photos (
  id UUID PRIMARY KEY,
  party_id UUID REFERENCES parties(id),
  uploader_id UUID REFERENCES uploaders(id),
  original_path TEXT NOT NULL,
  tv_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Storage Structure

```
photobooze-images/
  parties/
    {partyId}/
      original/
        {photoId}.{ext}
      tv/
        {photoId}.jpg
```

## Deployment (Vercel + Supabase Cloud)

1. Create Supabase project at https://supabase.com
2. Run migrations: `npx supabase db push`
3. Create storage bucket `photobooze-images`
4. Deploy to Vercel with environment variables

## Scripts

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```

## License

MIT
