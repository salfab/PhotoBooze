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

PhotoBooze uses **two services** for production:
- **Supabase Cloud** - Database, file storage, and real-time features
- **Vercel** - Hosts the Next.js application

Both have generous free tiers suitable for party photo apps.

### Prerequisites

- GitHub account (with this repo pushed)
- [Supabase](https://supabase.com) account (free)
- [Vercel](https://vercel.com) account (free, use GitHub OAuth)

---

### Step 1: Create Supabase Cloud Project

1. **Sign up** at [supabase.com](https://supabase.com) (use GitHub OAuth for quick setup)

2. **Create a new project**:
   - Click "New Project"
   - Choose an organization
   - Set project name: `photobooze` (or your preference)
   - Set a strong database password (save it!)
   - Select region closest to your users
   - Click "Create new project" and wait ~2 minutes

3. **Get your project credentials** (Settings → API):
   - `Project URL` - e.g., `https://xxxxx.supabase.co`
   - `anon public` key - starts with `eyJ...`
   - `service_role` key - starts with `eyJ...` (keep this secret!)
   - `Project Reference ID` - the `xxxxx` part from your URL

---

### Step 2: Push Database Schema to Supabase Cloud

```bash
# Login to Supabase CLI (opens browser)
npx supabase login

# Link your local project to the cloud project
npx supabase link --project-ref <your-project-ref>

# Push your database schema and create storage bucket
npx supabase db push
```

This creates all tables, enables Realtime, and creates the `photobooze-images` storage bucket automatically.

---

### Step 3: Deploy to Vercel

#### Option A: Via Vercel CLI (Recommended)

```bash
# Install and login to Vercel CLI
npx vercel login

# Deploy (first time creates the project)
npx vercel --yes

# Add environment variables
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Enter: https://your-project-ref.supabase.co

npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Enter: your anon key

npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
# Enter: your service role key (keep secret!)

npx vercel env add SESSION_SECRET production
# Enter: a random string at least 32 characters long (e.g., use openssl rand -base64 32)

npx vercel env add NEXT_PUBLIC_APP_URL production
# Enter: your Vercel deployment URL (e.g., https://photobooze.vercel.app)

# Deploy to production
npx vercel --prod
```

#### Option B: Via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository
3. Add environment variables before deploying:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `SESSION_SECRET` | Random 32+ character string |
| `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL |

4. Click **Deploy**

---

### Step 4: Verify Deployment

1. Open your Vercel URL (e.g., `https://photobooze.vercel.app`)
2. Go to `/admin` and create a test party
3. Scan the QR code with your phone
4. Upload a test photo
5. Check the TV view updates in real-time

---

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side only) |
| `SESSION_SECRET` | ✅ | JWT session secret (min 32 chars, use `openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your deployment URL (e.g., https://photobooze.vercel.app) |

> ⚠️ **Security**: Never commit secrets to git! The `.gitignore` already excludes `.env*` files.

---

### Updating Your Deployment

After making changes:

```bash
# Commit changes
git add . && git commit -m "your changes"

# Push to GitHub
git push origin master

# Redeploy to Vercel
npx vercel --prod
```

Or connect Vercel to your GitHub repo for automatic deployments on push.

## Contributing

PRs welcome! Please run `pnpm lint` and `pnpm typecheck` before submitting.

## License

MIT
