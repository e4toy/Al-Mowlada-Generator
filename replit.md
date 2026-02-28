# Al-Mowlada (المولدة) - Arabic Generator Subscription Management App

## Overview
A comprehensive Arabic RTL subscription management app for generator services built with Expo Router + Express backend. Uses a local-first architecture with AsyncStorage and PostgreSQL sync. Production domain: almolda.com

## Architecture
- **Frontend**: Expo Router (file-based routing), React Native
- **Backend**: Express + TypeScript on port 5000
- **Database**: PostgreSQL (Drizzle ORM) for server-side persistence, SSL auto-detected for external DBs
- **Local Storage**: AsyncStorage for offline-first data persistence
- **Sync**: Local-first with aggressive server sync - always attempts server first, falls back to local
- **State**: React Context (AppContext) for global state
- **API URL**: Configured via `EXPO_PUBLIC_API_URL` env var, defaults to `https://almolda.com`

## Sync Architecture (Local-First Hybrid)
- All data mutations save to AsyncStorage first (immediate, works offline)
- ALL operations attempt server sync unconditionally (no network-status guards)
- On sync failure, actions queued as SyncAction items in AsyncStorage
- On reconnect (NetInfo), all pending sync actions are processed automatically
- Login always tries server first, falls back to local on network error
- Session restore fetches latest owner status from server
- loadOwnerData merges server data with local data using LWW (last-write-wins by updatedAt)
- Admin login/refreshOwners always fetches from server, merges with local
- Admin screen auto-refreshes owners on mount, every 30s, and on app foreground
- Signup always attempts immediate POST to server, queues on failure
- Deletions: try server sync, queue to SyncAction on failure
- Conflict resolution: server skips updates if its data is newer (updatedAt comparison)
- All sync endpoints enforce ownerId scoping for multi-tenant isolation

## Key Features
- Owner/Admin authentication system
- Subscriber management with three-tier pricing (gold/silver/bronze)
- Payment tracking with WhatsApp integration
- Expense logging with date tracking
- Multi-month account renewal (1/3/6 months)
- Account suspension controls (admin toggle switch)
- Offline mode with NetInfo connectivity detection
- Custom premium modals (AlertProvider) replacing all native alerts/confirms
- Deep delete (subscribers + all associated payments)
- Pending activation screen with pulsing animation and refresh status

## Theme
- Primary: Sage Green (#8A9A5B)
- Font: Cairo (Arabic)
- RTL layout throughout

## File Structure
- `app/` - Expo Router screens (index, signup, admin-login, pending, suspended, dashboard, admin)
- `components/CustomAlert.tsx` - Premium custom modal system (AlertProvider + useAlert)
- `lib/storage.ts` - Data models, AsyncStorage helpers, utilities
- `lib/sync.ts` - Server sync functions (push/pull/delete) with 10s timeout
- `lib/query-client.ts` - API URL configuration (EXPO_PUBLIC_API_URL -> EXPO_PUBLIC_DOMAIN -> almolda.com)
- `contexts/AppContext.tsx` - Global state management with hybrid sync integration
- `shared/schema.ts` - Drizzle ORM schema (owners, subscribers, payments, expenses, pricing)
- `server/db.ts` - Database connection (PostgreSQL via Drizzle, auto SSL for external DBs)
- `server/routes.ts` - REST API routes (CRUD + sync endpoints)
- `constants/colors.ts` - Theme colors
- `server/` - Express backend
- `scripts/deploy.sh` - One-command VPS deployment script
- `.env.example` - Environment variable template for VPS

## API Endpoints
- `POST /api/owners/signup` - Register new owner
- `POST /api/owners/login` - Owner login
- `GET /api/owners` - List all owners (admin)
- `GET /api/owners/:id` - Get single owner
- `PUT /api/owners/:id` - Update owner (with updatedAt conflict check)
- `DELETE /api/owners/:id` - Delete owner + all related data
- `POST /api/sync` - Bulk upsert subscribers/payments/expenses/pricing (ownerId scoped)
- `POST /api/sync/delete` - Delete entity by id (ownerId scoped)
- `GET /api/owners/:id/data` - Get all owner data (subscribers, payments, expenses, pricing)

## Data Models
- **Owner**: id, name, phone, email, password, status (UserStatus enum), isActive, activatedAt, expiryDate
- **Subscriber**: id, ownerId, name, phone, amperes, tier, createdMonth
- **Payment**: id, ownerId, subscriberId, month, amount, date, type
- **Expense**: id, ownerId, month, description, amount, date
- **Pricing**: id, ownerId, month, gold, silver, bronze

## Admin Credentials
- Email: rb885491@gmail.com
- Password: E4toy1234

## Deployment (VPS / almolda.com)
- **One-command deploy**: `bash scripts/deploy.sh` (pulls, installs, builds, pushes DB, starts PM2)
- **CORS**: Server echoes origin with credentials, or uses * without credentials
- **Frontend API URL**: Uses `EXPO_PUBLIC_API_URL` env var, defaults to `https://almolda.com`
- **Database**: Auto-detects external PostgreSQL and enables SSL
- **Environment Variables for VPS** (see `.env.example`):
  - `DATABASE_URL` (PostgreSQL connection string - required)
  - `EXPO_PUBLIC_API_URL=https://almolda.com` (frontend API target)
  - `PORT=5000` (Express server port, optional - defaults to 5000)
  - `NODE_ENV=production` (for production mode)
- **Server Build**: `npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=server_dist`
- **Production Start**: `NODE_ENV=production node server_dist/index.js`
- **DB Schema Push**: `npx drizzle-kit push`

## Key Dependencies
- drizzle-orm - PostgreSQL ORM
- @react-native-community/netinfo - Offline detection
- @expo-google-fonts/cairo - Arabic font
- expo-haptics - Haptic feedback
- expo-crypto - UUID generation
- esbuild - Server bundling
- pg - PostgreSQL client
