import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  Storage, Owner, Subscriber, MonthlyPricing, Payment, Expense, Session,
  ADMIN_EMAIL, ADMIN_PASSWORD, isOwnerExpired, getMonthKey, getOwnerExpiryDate,
} from '@/lib/storage';

interface AppContextValue {
  session: Session;
  loading: boolean;
  currentOwner: Owner | null;
  owners: Owner[];
  subscribers: Subscriber[];
  pricing: Record<string, MonthlyPricing>;
  payments: Payment[];
  expenses: Expense[];
  login: (email: string, password: string) => Promise<{ success: boolean; message: string; pending?: boolean }>;
  signup: (name: string, phone: string, email: string, password: string) => Promise<{ success: boolean; message: string }>;
  adminLogin: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  addSubscriber: (data: Omit<Subscriber, 'id'>) => Promise<void>;
  updateSubscriber: (id: string, data: Partial<Omit<Subscriber, 'id'>>) => Promise<void>;
  deleteSubscriber: (id: string) => Promise<void>;
  setPricing: (month: string, prices: MonthlyPricing) => Promise<void>;
  recordPayment: (subscriberId: string, month: string, amount: number, type: 'full' | 'partial') => Promise<void>;
  cancelPayment: (paymentId: string) => Promise<void>;
  addExpense: (month: string, description: string, amount: number) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  approveOwner: (ownerId: string) => Promise<void>;
  rejectOwner: (ownerId: string) => Promise<void>;
  deleteOwner: (ownerId: string) => Promise<void>;
  renewOwner: (ownerId: string, months?: number) => Promise<void>;
  refreshOwners: () => Promise<void>;
  getSubscriberPayments: (subscriberId: string, month: string) => Payment[];
  getSubscriberDue: (subscriber: Subscriber, month: string) => number;
  getSubscriberPaid: (subscriberId: string, month: string) => number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [currentOwner, setCurrentOwner] = useState<Owner | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [pricing, setPricingState] = useState<Record<string, MonthlyPricing>>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundTimeRef = useRef<number | null>(null);

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [session]);

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    if (!session) return;
    if (nextState === 'background' || nextState === 'inactive') {
      backgroundTimeRef.current = Date.now();
    } else if (nextState === 'active' && backgroundTimeRef.current) {
      const elapsed = Date.now() - backgroundTimeRef.current;
      backgroundTimeRef.current = null;
      if (elapsed > 300000) {
        logout();
      }
    }
  }, [session]);

  async function loadSession() {
    try {
      const savedSession = await Storage.getSession();
      if (savedSession) {
        if (savedSession.type === 'owner' && savedSession.ownerId) {
          const allOwners = await Storage.getOwners();
          const owner = allOwners.find(o => o.id === savedSession.ownerId);
          if (owner && owner.status === 'approved' && !isOwnerExpired(owner)) {
            setSession(savedSession);
            setCurrentOwner(owner);
            setOwners(allOwners);
            await loadOwnerData(savedSession.ownerId);
          } else {
            await Storage.saveSession(null);
          }
        } else if (savedSession.type === 'admin') {
          setSession(savedSession);
          const allOwners = await Storage.getOwners();
          setOwners(allOwners);
        }
      }
    } catch (e) {
      console.error('Error loading session:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadOwnerData(ownerId: string) {
    const [subs, prc, pays, exps] = await Promise.all([
      Storage.getSubscribers(ownerId),
      Storage.getPricing(ownerId),
      Storage.getPayments(ownerId),
      Storage.getExpenses(ownerId),
    ]);
    setSubscribers(subs);
    setPricingState(prc);
    setPayments(pays);
    setExpenses(exps);
  }

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; message: string; pending?: boolean }> => {
    const allOwners = await Storage.getOwners();
    const owner = allOwners.find(o => o.email.toLowerCase() === email.toLowerCase());
    if (!owner) return { success: false, message: 'البريد الإلكتروني غير مسجل' };
    if (owner.password !== password) return { success: false, message: 'كلمة المرور غير صحيحة' };
    if (owner.status === 'pending') {
      setCurrentOwner(owner);
      setOwners(allOwners);
      return { success: false, message: 'حسابك قيد المراجعة من قبل المشرف', pending: true };
    }
    if (owner.status === 'rejected') return { success: false, message: 'تم رفض حسابك' };
    if (isOwnerExpired(owner)) return { success: false, message: 'انتهت صلاحية حسابك، يرجى التواصل مع المشرف للتجديد' };

    const newSession: Session = { type: 'owner', ownerId: owner.id };
    await Storage.saveSession(newSession);
    setSession(newSession);
    setCurrentOwner(owner);
    setOwners(allOwners);
    await loadOwnerData(owner.id);
    return { success: true, message: '' };
  }, []);

  const signup = useCallback(async (name: string, phone: string, email: string, password: string): Promise<{ success: boolean; message: string }> => {
    const allOwners = await Storage.getOwners();
    if (allOwners.some(o => o.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, message: 'البريد الإلكتروني مسجل مسبقاً' };
    }
    const newOwner: Owner = {
      id: Crypto.randomUUID(),
      name, phone, email, password,
      status: 'pending',
      activatedAt: null,
      expiryDate: null,
      createdAt: new Date().toISOString(),
    };
    allOwners.push(newOwner);
    await Storage.saveOwners(allOwners);
    return { success: true, message: 'تم إنشاء حسابك بنجاح وهو قيد المراجعة' };
  }, []);

  const adminLogin = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const newSession: Session = { type: 'admin' };
      await Storage.saveSession(newSession);
      setSession(newSession);
      const allOwners = await Storage.getOwners();
      setOwners(allOwners);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    await Storage.saveSession(null);
    setSession(null);
    setCurrentOwner(null);
    setSubscribers([]);
    setPricingState({});
    setPayments([]);
    setExpenses([]);
  }, []);

  const addSubscriber = useCallback(async (data: Omit<Subscriber, 'id'>) => {
    if (!currentOwner) return;
    const sub: Subscriber = { ...data, id: Crypto.randomUUID() };
    const updated = [...subscribers, sub];
    setSubscribers(updated);
    await Storage.saveSubscribers(currentOwner.id, updated);
  }, [currentOwner, subscribers]);

  const updateSubscriber = useCallback(async (id: string, data: Partial<Omit<Subscriber, 'id'>>) => {
    if (!currentOwner) return;
    const updated = subscribers.map(s => s.id === id ? { ...s, ...data } : s);
    setSubscribers(updated);
    await Storage.saveSubscribers(currentOwner.id, updated);
  }, [currentOwner, subscribers]);

  const deleteSubscriber = useCallback(async (id: string) => {
    if (!currentOwner) return;
    const updated = subscribers.filter(s => s.id !== id);
    setSubscribers(updated);
    await Storage.saveSubscribers(currentOwner.id, updated);
    const updatedPayments = payments.filter(p => p.subscriberId !== id);
    setPayments(updatedPayments);
    await Storage.savePayments(currentOwner.id, updatedPayments);
  }, [currentOwner, subscribers, payments]);

  const setPricing = useCallback(async (month: string, prices: MonthlyPricing) => {
    if (!currentOwner) return;
    const updated = { ...pricing, [month]: prices };
    setPricingState(updated);
    await Storage.savePricing(currentOwner.id, updated);
  }, [currentOwner, pricing]);

  const recordPayment = useCallback(async (subscriberId: string, month: string, amount: number, type: 'full' | 'partial') => {
    if (!currentOwner) return;
    const payment: Payment = {
      id: Crypto.randomUUID(),
      subscriberId, month, amount, type,
      date: new Date().toISOString(),
    };
    const updated = [...payments, payment];
    setPayments(updated);
    await Storage.savePayments(currentOwner.id, updated);
  }, [currentOwner, payments]);

  const cancelPayment = useCallback(async (paymentId: string) => {
    if (!currentOwner) return;
    const updated = payments.filter(p => p.id !== paymentId);
    setPayments(updated);
    await Storage.savePayments(currentOwner.id, updated);
  }, [currentOwner, payments]);

  const addExpense = useCallback(async (month: string, description: string, amount: number) => {
    if (!currentOwner) return;
    const expense: Expense = { id: Crypto.randomUUID(), month, description, amount, date: new Date().toISOString() };
    const updated = [...expenses, expense];
    setExpenses(updated);
    await Storage.saveExpenses(currentOwner.id, updated);
  }, [currentOwner, expenses]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!currentOwner) return;
    const updated = expenses.filter(e => e.id !== id);
    setExpenses(updated);
    await Storage.saveExpenses(currentOwner.id, updated);
  }, [currentOwner, expenses]);

  const approveOwner = useCallback(async (ownerId: string) => {
    const now = new Date();
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 30);
    const updated = owners.map(o =>
      o.id === ownerId ? { ...o, status: 'approved' as const, activatedAt: now.toISOString(), expiryDate: expiry.toISOString() } : o
    );
    setOwners(updated);
    await Storage.saveOwners(updated);
  }, [owners]);

  const rejectOwner = useCallback(async (ownerId: string) => {
    const updated = owners.map(o =>
      o.id === ownerId ? { ...o, status: 'rejected' as const } : o
    );
    setOwners(updated);
    await Storage.saveOwners(updated);
  }, [owners]);

  const deleteOwner = useCallback(async (ownerId: string) => {
    const updated = owners.filter(o => o.id !== ownerId);
    setOwners(updated);
    await Storage.saveOwners(updated);
  }, [owners]);

  const renewOwner = useCallback(async (ownerId: string, months: number = 1) => {
    const updated = owners.map(o => {
      if (o.id !== ownerId) return o;
      const now = new Date();
      let baseDate = now;
      if (o.expiryDate) {
        const existing = new Date(o.expiryDate);
        if (existing > now) baseDate = existing;
      }
      const expiry = new Date(baseDate);
      expiry.setDate(expiry.getDate() + (months * 30));
      return {
        ...o,
        status: 'approved' as const,
        activatedAt: o.activatedAt || now.toISOString(),
        expiryDate: expiry.toISOString(),
      };
    });
    setOwners(updated);
    await Storage.saveOwners(updated);
  }, [owners]);

  const refreshOwners = useCallback(async () => {
    const allOwners = await Storage.getOwners();
    setOwners(allOwners);
  }, []);

  const getSubscriberPayments = useCallback((subscriberId: string, month: string): Payment[] => {
    return payments.filter(p => p.subscriberId === subscriberId && p.month === month);
  }, [payments]);

  const getSubscriberDue = useCallback((subscriber: Subscriber, month: string): number => {
    const monthPricing = pricing[month];
    if (!monthPricing) return 0;
    return monthPricing[subscriber.tier] * subscriber.amperes;
  }, [pricing]);

  const getSubscriberPaid = useCallback((subscriberId: string, month: string): number => {
    return payments
      .filter(p => p.subscriberId === subscriberId && p.month === month)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const value = useMemo(() => ({
    session, loading, currentOwner, owners, subscribers, pricing, payments, expenses,
    login, signup, adminLogin, logout,
    addSubscriber, updateSubscriber, deleteSubscriber, setPricing,
    recordPayment, cancelPayment,
    addExpense, deleteExpense,
    approveOwner, rejectOwner, deleteOwner, renewOwner,
    refreshOwners, getSubscriberPayments, getSubscriberDue, getSubscriberPaid,
  }), [
    session, loading, currentOwner, owners, subscribers, pricing, payments, expenses,
    login, signup, adminLogin, logout,
    addSubscriber, updateSubscriber, deleteSubscriber, setPricing,
    recordPayment, cancelPayment,
    addExpense, deleteExpense,
    approveOwner, rejectOwner, deleteOwner, renewOwner,
    refreshOwners, getSubscriberPayments, getSubscriberDue, getSubscriberPaid,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
