# Next.js & React Architecture

This document explains how Next.js and React work together in PhotoBooze, and how this differs from a traditional React Single Page Application (SPA).

## Table of Contents

- [Overview](#overview)
- [React SPA vs Next.js](#react-spa-vs-nextjs)
- [Next.js App Router](#nextjs-app-router)
- [Server vs Client Components](#server-vs-client-components)
- [Rendering Strategies](#rendering-strategies)
- [PhotoBooze Architecture](#photobooze-architecture)
- [Data Flow](#data-flow)
- [Key Differences Summary](#key-differences-summary)

---

## Overview

**React** is a JavaScript library for building user interfaces using components. It runs entirely in the browser (client-side) and manages UI state and rendering.

**Next.js** is a React framework that adds:
- Server-side rendering (SSR)
- Static site generation (SSG)
- File-based routing
- API routes
- Automatic code splitting
- Built-in optimizations

Think of it this way: **React is the engine, Next.js is the car**.

---

## React SPA vs Next.js

### Traditional React SPA

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
├─────────────────────────────────────────────────────────────┤
│  1. Request index.html                                       │
│  2. Receive minimal HTML shell:                              │
│     <div id="root"></div>                                    │
│  3. Download large JavaScript bundle (~500KB+)               │
│  4. JavaScript executes, React mounts                        │
│  5. React renders entire UI                                  │
│  6. Fetch data via API calls                                 │
│  7. Update UI with data                                      │
└─────────────────────────────────────────────────────────────┘

Timeline: [blank page] ──> [loading spinner] ──> [content]
          ~0ms              ~500ms               ~1500ms
```

**Characteristics:**
- Single HTML file serves all routes
- Client-side routing (React Router)
- All rendering happens in browser
- Large initial JavaScript bundle
- SEO challenges (empty HTML for crawlers)
- Slower Time to First Contentful Paint (FCP)

### Next.js Application

```
┌─────────────────────────────────────────────────────────────┐
│                        SERVER                                │
├─────────────────────────────────────────────────────────────┤
│  1. Request /admin                                           │
│  2. Server executes React components                         │
│  3. Server generates complete HTML                           │
│  4. Server sends HTML + minimal JS                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
├─────────────────────────────────────────────────────────────┤
│  5. Display pre-rendered HTML immediately                    │
│  6. Download page-specific JavaScript                        │
│  7. "Hydration": React attaches to existing HTML             │
│  8. Page becomes interactive                                 │
└─────────────────────────────────────────────────────────────┘

Timeline: [content visible] ──> [interactive]
          ~200ms                ~500ms
```

**Characteristics:**
- Each route can have its own rendering strategy
- Server Components run only on server
- Automatic code splitting per route
- Better SEO (full HTML for crawlers)
- Faster perceived performance
- Smaller client-side JavaScript

---

## Next.js App Router

PhotoBooze uses the **App Router** (introduced in Next.js 13), which is based on the `app/` directory structure.

### File-Based Routing

```
src/app/
├── layout.tsx          → Root layout (wraps all pages)
├── page.tsx            → / (home page)
├── globals.css         → Global styles
│
├── admin/
│   └── page.tsx        → /admin
│
├── join/
│   └── [partyId]/
│       └── page.tsx    → /join/:partyId (dynamic route)
│
├── upload/
│   └── [partyId]/
│       └── page.tsx    → /upload/:partyId
│
├── tv/
│   └── [partyId]/
│       └── page.tsx    → /tv/:partyId
│
└── api/                → API Routes (server-only)
    ├── parties/
    │   └── route.ts    → GET/POST /api/parties
    ├── join/
    │   └── route.ts    → POST /api/join
    └── session/
        └── route.ts    → GET /api/session
```

### Special Files

| File | Purpose |
|------|---------|
| `page.tsx` | Defines a route's UI |
| `layout.tsx` | Shared UI wrapper (persists across navigation) |
| `loading.tsx` | Loading UI (Suspense boundary) |
| `error.tsx` | Error boundary UI |
| `route.ts` | API endpoint (no UI) |

---

## Server vs Client Components

This is the **most important concept** in modern Next.js.

### Server Components (Default)

```tsx
// This runs ONLY on the server
// No 'use client' directive

async function PartyList() {
  // Can directly access database
  const parties = await db.query('SELECT * FROM parties');
  
  // Can use server-only modules
  const secret = process.env.DATABASE_URL;
  
  // Returns HTML, not JavaScript
  return (
    <ul>
      {parties.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

**Can do:**
- Direct database queries
- Access server-only secrets
- Use Node.js APIs
- Fetch data without exposing endpoints

**Cannot do:**
- Use `useState`, `useEffect`
- Access browser APIs (`window`, `document`)
- Handle user events (`onClick`)

### Client Components

```tsx
'use client';  // ← This directive is required

import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}
```

**Can do:**
- Use React hooks (`useState`, `useEffect`, etc.)
- Access browser APIs
- Handle user interactions
- Maintain client-side state

**Cannot do:**
- Direct database access
- Use server-only modules

### The Boundary

```tsx
// layout.tsx (Server Component)
export default function Layout({ children }) {
  return (
    <html>
      <body>
        <ServerHeader />      {/* Server Component */}
        {children}            {/* Can be either */}
        <ClientFooter />      {/* Client Component */}
      </body>
    </html>
  );
}
```

**Rule**: Server Components can import Client Components, but Client Components cannot import Server Components.

---

## Rendering Strategies

Next.js supports multiple rendering strategies, chosen per-route:

### 1. Static Generation (SSG)

```
Build Time                          Runtime
    │                                   │
    ▼                                   ▼
┌─────────┐                      ┌─────────────┐
│ Generate │  ──> HTML files ──> │ Serve from  │
│   HTML   │                     │    CDN      │
└─────────┘                      └─────────────┘
```

- HTML generated at **build time**
- Cached and served from CDN
- Fastest possible response
- Used for: Marketing pages, documentation

### 2. Server-Side Rendering (SSR)

```
Every Request
      │
      ▼
┌──────────────┐     ┌──────────────┐
│ Server runs  │ ──> │ Fresh HTML   │
│  components  │     │   response   │
└──────────────┘     └──────────────┘
```

- HTML generated on **every request**
- Always fresh data
- Slower than SSG
- Used for: User-specific content, real-time data

### 3. Client-Side Rendering (CSR)

```
Initial Load                    After Hydration
     │                               │
     ▼                               ▼
┌──────────┐                  ┌──────────────┐
│ Shell or │                  │ Fetch data,  │
│ skeleton │                  │ render in    │
└──────────┘                  │   browser    │
                              └──────────────┘
```

- Minimal HTML from server
- Data fetched client-side
- Used for: Highly interactive UIs, user-specific data

### PhotoBooze's Approach: Hybrid

Most PhotoBooze pages are **Client Components** (`'use client'`) because they need:
- Real-time subscriptions (Supabase Realtime)
- Camera access (browser APIs)
- Heavy user interaction

But they still benefit from Next.js:
- Server-rendered shell/layout
- API routes for backend logic
- Automatic code splitting
- Optimized bundling

---

## PhotoBooze Architecture

### Component Classification

```
┌─────────────────────────────────────────────────────────────┐
│                    SERVER COMPONENTS                         │
├─────────────────────────────────────────────────────────────┤
│  • src/app/layout.tsx (root layout, metadata)               │
│  • API Routes (src/app/api/**)                              │
│    - /api/parties (CRUD operations)                         │
│    - /api/join (session creation)                           │
│    - /api/session (auth check)                              │
│    - /api/photos/prepare-upload (signed URLs)               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    CLIENT COMPONENTS                         │
├─────────────────────────────────────────────────────────────┤
│  • src/app/admin/page.tsx                                   │
│    - Party management, QR generation                        │
│    - Uses: useState, useEffect, useCallback                 │
│                                                             │
│  • src/app/join/[partyId]/page.tsx                          │
│    - Guest name entry, token validation                     │
│    - Uses: useState, useRouter, fetch                       │
│                                                             │
│  • src/app/upload/[partyId]/page.tsx                        │
│    - Camera capture, photo upload                           │
│    - Uses: useState, camera APIs, Supabase client           │
│                                                             │
│  • src/app/tv/[partyId]/page.tsx                            │
│    - Live slideshow, real-time updates                      │
│    - Uses: useState, Supabase Realtime subscriptions        │
│                                                             │
│  • src/components/*.tsx                                      │
│    - CameraTab, RemoteTab, ShareTab, etc.                   │
│    - Reusable UI components with interactivity              │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow Example: Joining a Party

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│ Mobile  │     │   Next.js   │     │  API Route  │     │ Supabase │
│ Browser │     │   Server    │     │ /api/join   │     │    DB    │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └────┬─────┘
     │                 │                   │                  │
     │ GET /join/abc   │                   │                  │
     │────────────────>│                   │                  │
     │                 │                   │                  │
     │  HTML + JS      │                   │                  │
     │<────────────────│                   │                  │
     │                 │                   │                  │
     │ [Hydration]     │                   │                  │
     │                 │                   │                  │
     │ POST /api/join  │                   │                  │
     │────────────────────────────────────>│                  │
     │                 │                   │                  │
     │                 │                   │ Validate token   │
     │                 │                   │─────────────────>│
     │                 │                   │                  │
     │                 │                   │ Create uploader  │
     │                 │                   │─────────────────>│
     │                 │                   │                  │
     │  Set-Cookie     │                   │                  │
     │<────────────────────────────────────│                  │
     │                 │                   │                  │
     │ [Redirect to /upload/abc]           │                  │
     │                 │                   │                  │
```

### Real-Time Architecture (TV Display)

```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│   Mobile    │          │  Supabase   │          │     TV      │
│  (Upload)   │          │  Realtime   │          │ (Slideshow) │
└──────┬──────┘          └──────┬──────┘          └──────┬──────┘
       │                        │                        │
       │ Upload photo           │                        │
       │───────────────────────>│                        │
       │                        │                        │
       │                        │ INSERT event           │
       │                        │───────────────────────>│
       │                        │                        │
       │                        │          [New photo    │
       │                        │           appears]     │
       │                        │                        │
       │ Broadcast: navigate    │                        │
       │───────────────────────>│                        │
       │                        │───────────────────────>│
       │                        │                        │
       │                        │          [TV advances  │
       │                        │           to photo]    │
```

---

## Data Flow

### Server-Side (API Routes)

```
┌─────────────────────────────────────────────────────────────┐
│                     API ROUTE LAYER                          │
│                  (src/app/api/**/route.ts)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Request   │───>│  Validate   │───>│   Execute   │     │
│  │   Handler   │    │   Input     │    │   Logic     │     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘     │
│                                               │             │
│                                               ▼             │
│                                        ┌─────────────┐     │
│                                        │  Supabase   │     │
│                                        │   Client    │     │
│                                        │  (Server)   │     │
│                                        └─────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Client-Side (React Components)

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT COMPONENT                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   useState  │<──>│   Event     │───>│   fetch()   │     │
│  │   State     │    │  Handlers   │    │  API Call   │     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘     │
│         │                                      │             │
│         ▼                                      ▼             │
│  ┌─────────────┐                        ┌─────────────┐     │
│  │    React    │                        │  /api/...   │     │
│  │   Render    │                        │   Route     │     │
│  └─────────────┘                        └─────────────┘     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Supabase Realtime                       │   │
│  │  (Subscriptions for live updates)                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Differences Summary

| Aspect | React SPA | Next.js (PhotoBooze) |
|--------|-----------|---------------------|
| **Initial Load** | Empty HTML + large JS bundle | Pre-rendered HTML + small JS |
| **Routing** | Client-side (React Router) | Hybrid (file-based) |
| **Data Fetching** | All client-side | Server or client |
| **API** | Separate backend needed | Built-in API routes |
| **Code Splitting** | Manual configuration | Automatic per-route |
| **SEO** | Poor (empty HTML) | Good (server-rendered) |
| **Bundle Size** | One large bundle | Split per route |
| **Server Access** | Never | Server Components + API |

### When PhotoBooze Uses Each Pattern

| Feature | Pattern | Reason |
|---------|---------|--------|
| Page shell | SSR | Fast initial paint |
| Party list | CSR | Real-time updates needed |
| Photo upload | CSR | Camera API, heavy interaction |
| TV slideshow | CSR | Real-time subscriptions |
| QR code gen | CSR | Dynamic per-party |
| API endpoints | Server | Database access, auth |
| Image processing | Client | Runs in browser (no server load) |

---

## Further Reading

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [React Server Components](https://react.dev/reference/react/use-server)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [PhotoBooze ADRs](./adr/) - Architecture Decision Records
