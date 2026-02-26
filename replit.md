# Al-Mowlada (المولدة) - Arabic Generator Subscription Management App

## Overview
A comprehensive Arabic RTL subscription management app for generator services built with Expo Router + Express backend.

## Architecture
- **Frontend**: Expo Router (file-based routing), React Native
- **Backend**: Express + TypeScript on port 5000
- **Storage**: AsyncStorage (local data persistence)
- **State**: React Context (AppContext) for global state

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
- `contexts/AppContext.tsx` - Global state management with NetInfo
- `constants/colors.ts` - Theme colors
- `server/` - Express backend

## Data Models
- **Owner**: id, name, phone, email, password, status (UserStatus enum), isActive, activatedAt, expiryDate
- **Subscriber**: id, name, phone, amperes, tier, createdMonth
- **Payment**: id, subscriberId, month, amount, date, type
- **Expense**: id, month, description, amount, date

## Admin Credentials
- Email: rb885491@gmail.com
- Password: E4toy1234

## Key Dependencies
- @react-native-community/netinfo - Offline detection
- @expo-google-fonts/cairo - Arabic font
- expo-haptics - Haptic feedback
- expo-crypto - UUID generation
