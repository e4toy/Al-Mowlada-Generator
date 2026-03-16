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

## Subscriber Platform (New)
- Owners get a unique 6-char invitation code (first 6 chars of UUID, uppercase)
- Subscribers register via `/signup` -> role select -> `/subscriber-onboarding` (enter invite code + register)
- Subscriber sessions stored in AsyncStorage, redirect to `/subscriber-dashboard`
- Owner drawer panel (hamburger menu in dashboard) with: statistics, pricing, expenses, app users list, broadcast message, payment methods, payout history, logout
- Subscriber dashboard: 3-tab interface (prices, messages, payments) + side drawer with payment methods and logout
- Broadcast messaging: owners post title+body messages; subscribers see them in the messages tab
- Payment methods: both owners and subscribers can register ZainCash or card payment methods
- Payout history: tracked in `payouts` table (owner-side)
- App users list: owners see which subscribers have registered in the app and their link status
- Phone number matching: subscriber registration auto-links to existing subscriber record by phone

## Theme
- Primary: Sage Green (#8A9A5B)
- Font: Cairo (Arabic)
- RTL layout throughout

## File Structure
- `app/` - Expo Router screens:
  - `index.tsx` - Owner login
  - `signup.tsx` - Role selection (owner vs subscriber)
  - `subscriber-onboarding.tsx` - Invitation code + subscriber registration
  - `subscriber-dashboard.tsx` - Subscriber home (prices/messages/payments tabs + drawer)
  - `dashboard.tsx` - Owner dashboard with drawer panel (hamburger menu)
  - `admin-login.tsx`, `admin.tsx` - Admin panel
  - `pending.tsx`, `suspended.tsx` - Account state screens
- `components/CustomAlert.tsx` - Premium custom modal system (AlertProvider + useAlert)
- `lib/storage.ts` - Data models, AsyncStorage helpers, utilities (AppUser, AppMessage, PaymentMethodData)
- `lib/sync.ts` - Server sync functions (push/pull/delete) with 10s timeout
- `lib/query-client.ts` - API URL configuration (EXPO_PUBLIC_API_URL -> EXPO_PUBLIC_DOMAIN -> almolda.com)
- `contexts/AppContext.tsx` - Global state management (owner + subscriber sessions)
- `shared/schema.ts` - Drizzle ORM schema (8 tables: owners, subscribers, payments, expenses, pricing, appUsers, messages, paymentMethods, payouts)
- `server/db.ts` - Database connection (PostgreSQL via Drizzle, auto SSL for external DBs)
- `server/routes.ts` - REST API routes (CRUD + sync + subscriber platform endpoints)
- `server/migrations.ts` - DB migration runner (run on startup with IF NOT EXISTS safety)
- `constants/colors.ts` - Theme colors
- `metro.config.js` - Metro bundler config (excludes .local from watching)
- `.watchmanconfig` - Watchman ignore config (ignores .local directory)
- `scripts/deploy.sh` - One-command VPS deployment script

## API Endpoints
### Owner
- `POST /api/owners/signup` - Register new owner
- `POST /api/owners/login` - Owner login (returns owner with invitationCode)
- `GET /api/owners/by-code/:code` - Lookup owner by 6-char invitation code
- `GET /api/owners` - List all owners (admin)
- `GET /api/owners/:id` - Get single owner
- `PUT /api/owners/:id` - Update owner
- `DELETE /api/owners/:id` - Delete owner + all related data
- `GET /api/owners/:id/data` - Get all owner data
- `GET /api/owners/:ownerId/app-users` - List app users linked to this owner

### Sync
- `POST /api/sync` - Bulk upsert subscribers/payments/expenses/pricing (ownerId scoped)
- `POST /api/sync/delete` - Delete entity by id (ownerId scoped)

### Subscriber Platform
- `POST /api/app-users/register` - Register subscriber (requires invitation code)
- `POST /api/app-users/login` - Subscriber login
- `GET /api/app-users/:id` - Get subscriber profile
- `GET /api/app-users/:id/pricing` - Get pricing for subscriber's owner (all months)
- `GET /api/app-users/:id/payments` - Get subscriber's payment history
- `PUT /api/app-users/:id/link-subscriber` - Link app user to subscriber record

### Messaging
- `POST /api/messages` - Create broadcast message
- `GET /api/messages/:ownerId` - Get all messages for an owner
- `DELETE /api/messages/:id` - Delete a message

### Payment Methods
- `POST /api/payment-methods` - Add payment method (owner or subscriber)
- `GET /api/payment-methods/:userId` - Get payment methods for user
- `DELETE /api/payment-methods/:id` - Delete payment method

### Payouts
- `POST /api/payouts` - Record a payout
- `GET /api/payouts/:ownerId` - Get payout history for owner

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
