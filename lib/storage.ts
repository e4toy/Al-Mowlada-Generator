import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  OWNERS: '@almowlada_owners',
  SESSION: '@almowlada_session',
  subscribers: (ownerId: string) => `@almowlada_subs_${ownerId}`,
  pricing: (ownerId: string) => `@almowlada_pricing_${ownerId}`,
  payments: (ownerId: string) => `@almowlada_payments_${ownerId}`,
  expenses: (ownerId: string) => `@almowlada_expenses_${ownerId}`,
};

export interface Owner {
  id: string;
  name: string;
  phone: string;
  email: string;
  password: string;
  status: 'pending' | 'approved' | 'rejected';
  activatedAt: string | null;
  expiryDate: string | null;
  createdAt: string;
}

export interface Subscriber {
  id: string;
  name: string;
  phone: string;
  amperes: number;
  tier: 'gold' | 'silver' | 'bronze';
  createdMonth: string;
}

export interface MonthlyPricing {
  gold: number;
  silver: number;
  bronze: number;
}

export interface Payment {
  id: string;
  subscriberId: string;
  month: string;
  amount: number;
  date: string;
  type: 'full' | 'partial';
}

export interface Expense {
  id: string;
  month: string;
  description: string;
  amount: number;
  date: string;
}

export type Session = { type: 'owner'; ownerId: string } | { type: 'admin' } | null;

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const Storage = {
  async getOwners(): Promise<Owner[]> {
    return getJSON(KEYS.OWNERS, []);
  },
  async saveOwners(owners: Owner[]): Promise<void> {
    await setJSON(KEYS.OWNERS, owners);
  },
  async getSession(): Promise<Session> {
    return getJSON(KEYS.SESSION, null);
  },
  async saveSession(session: Session): Promise<void> {
    if (session) {
      await setJSON(KEYS.SESSION, session);
    } else {
      await AsyncStorage.removeItem(KEYS.SESSION);
    }
  },
  async getSubscribers(ownerId: string): Promise<Subscriber[]> {
    return getJSON(KEYS.subscribers(ownerId), []);
  },
  async saveSubscribers(ownerId: string, subs: Subscriber[]): Promise<void> {
    await setJSON(KEYS.subscribers(ownerId), subs);
  },
  async getPricing(ownerId: string): Promise<Record<string, MonthlyPricing>> {
    return getJSON(KEYS.pricing(ownerId), {});
  },
  async savePricing(ownerId: string, pricing: Record<string, MonthlyPricing>): Promise<void> {
    await setJSON(KEYS.pricing(ownerId), pricing);
  },
  async getPayments(ownerId: string): Promise<Payment[]> {
    return getJSON(KEYS.payments(ownerId), []);
  },
  async savePayments(ownerId: string, payments: Payment[]): Promise<void> {
    await setJSON(KEYS.payments(ownerId), payments);
  },
  async getExpenses(ownerId: string): Promise<Expense[]> {
    return getJSON(KEYS.expenses(ownerId), []);
  },
  async saveExpenses(ownerId: string, expenses: Expense[]): Promise<void> {
    await setJSON(KEYS.expenses(ownerId), expenses);
  },
};

export const ADMIN_EMAIL = 'rb885491@gmail.com';
export const ADMIN_PASSWORD = 'E4toy1234';

export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function getMonthLabel(monthKey: string): string {
  const [year, m] = monthKey.split('-');
  const monthIdx = parseInt(m, 10) - 1;
  return `${ARABIC_MONTHS[monthIdx]} ${year}`;
}

export function sanitizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('964')) cleaned = '964' + cleaned;
  return cleaned;
}

export function isOwnerExpired(owner: Owner): boolean {
  if (owner.expiryDate) {
    return new Date() > new Date(owner.expiryDate);
  }
  if (!owner.activatedAt) return false;
  const activated = new Date(owner.activatedAt);
  const now = new Date();
  const diff = now.getTime() - activated.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  return days > 30;
}

export function getOwnerExpiryDate(owner: Owner): Date | null {
  if (owner.expiryDate) return new Date(owner.expiryDate);
  if (!owner.activatedAt) return null;
  const d = new Date(owner.activatedAt);
  d.setDate(d.getDate() + 30);
  return d;
}

export function getDaysRemaining(owner: Owner): number {
  const expiry = getOwnerExpiryDate(owner);
  if (!expiry) return 0;
  const diff = expiry.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getTierColor(tier: 'gold' | 'silver' | 'bronze'): string {
  switch (tier) {
    case 'gold': return '#D4AF37';
    case 'silver': return '#8E8E93';
    case 'bronze': return '#CD7F32';
  }
}

export function getTierBgColor(tier: 'gold' | 'silver' | 'bronze'): string {
  switch (tier) {
    case 'gold': return 'rgba(212, 175, 55, 0.15)';
    case 'silver': return 'rgba(142, 142, 147, 0.15)';
    case 'bronze': return 'rgba(205, 127, 50, 0.15)';
  }
}

export function getTierLabel(tier: 'gold' | 'silver' | 'bronze'): string {
  switch (tier) {
    case 'gold': return 'ذهبي';
    case 'silver': return 'ليلي';
    case 'bronze': return 'عادي';
  }
}
