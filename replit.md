# Al-Mowlada (المولدة) - Arabic Generator Subscription Management App

## Overview
A comprehensive Arabic RTL subscription management app for generator services built with Expo Router + Express backend. Uses a local-first architecture with AsyncStorage and PostgreSQL sync.

## Architecture
- **Frontend**: Expo Router (file-based routing), React Native
- **Backend**: Express + TypeScript on port 5000
- **Database**: PostgreSQL (Drizzle ORM) for server-side persistence
- **Local Storage**: AsyncStorage for offline-first data persistence
- **Sync**: Local-first with background sync to PostgreSQL when online
- **State**: React Context (AppContext) for global state

## Sync Architecture (Local-First)
- All data mutations save to AsyncStorage first (immediate, works offline)
- When online, mutations are synced to PostgreSQL via REST API
- Deletions queue as SyncAction items when offline, processed on reconnect
- Admin login always fetches from server first, merges with local (last-write-wins by updatedAt)
- Admin screen auto-refreshes owners on mount, every 30s, and on app foreground
- Signup always attempts server sync regardless of network status detection
- All admin operations (approve/reject/delete/renew/toggle) sync to server unconditionally
- Owner login pulls server data if local is empty (first-device bootstrap)
- All sync endpoints enforce ownerId scoping for multi-tenant isolation
- Conflict resolution: server skips updates if its data is newer (updatedAt comparison)

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
- `lib/sync.ts` - Server sync functions (push/pull/delete)
- `contexts/AppContext.tsx` - Global state management with sync integration
- `shared/schema.ts` - Drizzle ORM schema (owners, subscribers, payments, expenses, pricing)
- `server/db.ts` - Database connection (PostgreSQL via Drizzle)
- `server/routes.ts` - REST API routes (CRUD + sync endpoints)
- `constants/colors.ts` - Theme colors
- `server/` - Express backend

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
- **CORS**: Server echoes origin with credentials, or uses * without credentials
- **Frontend API URL**: Falls back to `almolda.com` when `EXPO_PUBLIC_DOMAIN` is not set
- **Build script**: Falls back to `almolda.com` domain when no Replit env vars are present
- **Environment Variables for VPS**:
  - `DATABASE_URL` (PostgreSQL connection string - required)
  - `EXPO_PUBLIC_DOMAIN=almolda.com` (frontend API target)
  - `PORT=5000` (Express server port, optional - defaults to 5000)
  - `NODE_ENV=production` (for production mode)
- **No Replit-specific dependencies**: Server and frontend work without Replit env vars

## Key Dependencies
- drizzle-orm - PostgreSQL ORM
- @react-native-community/netinfo - Offline detection
- @expo-google-fonts/cairo - Arabic font
- expo-haptics - Haptic feedback
- expo-crypto - UUID generation
