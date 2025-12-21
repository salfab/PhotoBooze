# PhotoBooze 📷🎉

A party photo sharing app where guests scan a QR code to upload photos, which are displayed live on a TV slideshow.

## Features

- **QR Code Access** → Guests scan to join and upload photos
- **Mobile-First Upload** → Native camera on phones, webcam on desktop
- **Photo Comments** → Add optional comments to photos
- **Live TV Slideshow** → Real-time updates via Supabase Realtime (websockets)
- **Session Persistence** → No need to re-enter name on repeat scans
- **Webcam Timer** → 5-second countdown for group photos
- **Client-Side Processing** → HEIC/HEIF conversion + resize for TV display
- **Download All** → ZIP archive of original photos
- **Party Management** → Close or delete parties with all data

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, MUI, CSS Modules
- **Backend**: Supabase (Postgres + Storage + Realtime)
- **Auth**: JWT session cookies (jose)
- **Image Processing**: heic2any, canvas resize (client-side)
- **Real-time**: Supabase Realtime (websockets)

## Quick Start

### Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/)
- **pnpm** - Install: `npm install -g pnpm`
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/) (for local Supabase)

### Local Development Setup

#### First-Time Setup (New Machine)

1. **Clone and install dependencies**:
   ```bash
   git clone <repo-url>
   cd PhotoBooze
   pnpm install
   ```

2. **Start Supabase** (requires Docker to be running):
   ```bash
   npx supabase start
   ```
   
   This starts all Supabase services and runs database migrations.
   
   **Important**: Copy the `SERVICE_ROLE_KEY` (long JWT token) from the output.

3. **Create `.env.local`** in the project root:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Paste SERVICE_ROLE_KEY here
   SESSION_SECRET=dev-session-secret-change-in-production-32chars!!
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Run setup** (creates storage bucket):
   ```bash
   pnpm dev:setup
   ```
   
   You should see: `✅ Storage bucket created successfully`

5. **Start the dev server**:
   ```bash
   pnpm dev
   ```

6. **Open**: http://localhost:3000/admin

#### Daily Development (After First Setup)

Just run:
```bash
pnpm dev
```

The storage bucket persists, so you only need setup once.

> **Note**: `pnpm install` automatically runs setup via postinstall hook, so storage bucket creation is automatic!

### Troubleshooting

**"Bucket not found" errors?**
```bash
pnpm dev:setup
```

**Complete database reset** (loses all data):
```bash
npx supabase db reset
pnpm dev:setup
```

**Supabase not starting?**
- Ensure Docker Desktop is running
- Check if ports 54321-54326 are available
- Try: `npx supabase stop` then `npx supabase start`

**Supabase not starting?**
- Ensure Docker Desktop is running
- Check if ports 54321-54326 are available
- Try: `npx supabase stop` then `npx supabase start`

**Edge runtime errors?**
The edge runtime may fail on Windows with certificate errors. This is normal and can be ignored - it's disabled in the config.

**Port conflicts?**
If port 3000 is in use, Next.js will automatically use the next available port (3001, 3002, etc.).

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
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- uploaders: Guest records
CREATE TABLE uploaders (
  id UUID PRIMARY KEY,
  party_id UUID REFERENCES parties(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- photos: Uploaded photos
CREATE TABLE photos (
  id UUID PRIMARY KEY,
  party_id UUID REFERENCES parties(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES uploaders(id) ON DELETE CASCADE,
  original_path TEXT NOT NULL,
  tv_path TEXT NOT NULL,
  comment TEXT,
  original_mime TEXT,
  tv_mime TEXT,
  original_bytes BIGINT,
  tv_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Storage Structure

```
photobooze-images/  (Storage bucket)
  parties/
    {partyId}/
      original/
        {photoId}.{ext}  (Original uploaded image)
      tv/
        {photoId}.jpg    (Resized for TV display - max 1920px)
```

## Useful Commands

```bash
# Development
pnpm dev              # Start Next.js dev server
pnpm build            # Production build
pnpm lint             # Run ESLint
pnpm typecheck        # TypeScript check

# Supabase (local)
npx supabase start    # Start local Supabase (Docker)
npx supabase stop     # Stop local Supabase
npx supabase db reset # Reset database and re-run migrations
npx supabase status   # Check status and get credentials
```

## Project Structure

```
PhotoBooze/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── admin/        # Party management
│   │   ├── join/         # Guest join page
│   │   ├── upload/       # Photo upload page
│   │   ├── tv/           # TV slideshow
│   │   └── api/          # API routes
│   ├── lib/              # Utilities
│   │   ├── supabase/     # Supabase clients
│   │   ├── auth.ts       # Session management
│   │   └── image.ts      # Image processing
│   └── types/            # TypeScript types
├── supabase/
│   ├── migrations/       # Database migrations
│   │   ├── 20241221000000_initial_schema.sql
│   │   ├── 20241221000001_enable_realtime.sql
│   │   └── 20241221000002_create_storage_bucket.sql
│   └── config.toml       # Supabase configuration
├── scripts/
│   └── setup-storage.mjs # Legacy storage setup (now automated)
└── .env.local            # Environment variables (create this)
```

## Deployment (Vercel + Supabase Cloud)

### 1. Set up Supabase Cloud

1. Create a project at [supabase.com](https://supabase.com)
2. Get your project credentials (Project Settings → API)
3. Run migrations:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
4. The storage bucket will be created automatically by the migrations

### 2. Deploy to Vercel

1. Push your code to GitHub
2. Import project to [Vercel](https://vercel.com)
3. Add environment variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   SESSION_SECRET=<generate-random-32+-char-string>
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```
4. Deploy!

## Contributing

PRs welcome! Please run `pnpm lint` and `pnpm typecheck` before submitting.

## License

MIT
