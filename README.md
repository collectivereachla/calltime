# Calltime.

Production management for theatre artists.

A Creative Reach LLC product. Built inside Heritage Parc / Black Theatre Experience.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **Supabase** (Auth, Postgres, RLS)
- **Tailwind CSS** (Calltime design system)
- **Vercel** (Hosting)

## Setup

```bash
npm install
cp .env.local.example .env.local
# Add your Supabase anon key to .env.local
npm run dev
```

## Supabase

Project: `lyyqmbabqisljqrowwpr` (us-east-1)

The database schema is managed via tracked migrations in Supabase.  
Current migration: `drop_old_schema_and_create_multi_company_foundation`

### Auth configuration

In the Supabase dashboard (Authentication → URL Configuration):
- Site URL: your Vercel deployment URL
- Redirect URLs: add `http://localhost:3000/auth/callback`

For local development, disable email confirmations:  
Authentication → Providers → Email → toggle off "Confirm email"

## Architecture

Multi-company from day one. One person, many organizations, many productions.

- `organizations` — theatre companies (BTE, IPAL, etc.)
- `org_memberships` — who belongs to which org (owner/admin/member)
- `people` — humans, org-independent
- `productions` — shows, org-scoped
- `production_assignments` — who's on this show (access_tier governs room permissions)
- `schedule_events` → `event_calls` → `call_responses` — the call/confirm loop

Row Level Security enforces org isolation. Cross-company features (unified calendar, conflict detection) query across orgs for the authenticated user only.
