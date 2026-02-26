import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus, Alert, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import {
  Storage, Owner, Subscriber, MonthlyPricing, Payment, Expense, Session,
  UserStatus, ADMIN_EMAIL, ADMIN_PASSWORD, isOwnerExpired, getOwnerExpiryDate,
} from '@/lib/storage';

interface AppContextValue {
  session: Session;
  loading: boolean;
  isOnline: boolean;
  currentOwner: Owner | null;
  owners: Owner[];
  subscribers: Subscriber[];
  pricing: Record<string, MonthlyPricing>;
  payments: Payment[];
  expenses: Expense[];
  login: (email: string, password: string) => Promise<{ success: boolean; message: string; pending?: boolean; suspended?: boolean }>;
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
  toggleOwnerActive: (ownerId: string) => Promise<void>;
  refreshOwners: () => Promise<void>;
  refreshCurrentOwner: () => Promise<Owner | null>;
  getSubscriberPayments: (subscriberId: string, month: string) => Payment[];
  getSubscriberDue: (subscriber: Subscriber, month: string) => number;
  getSubscriberPaid: (subscriberId: string, month: string) => number;
}

const AppContext = createContext<AppContextValue | null>(null);

function showToast(message: string) {
  if (Platform.OS === 'web') {
    console.log(message);
  } else {
    Alert.alert('', message);
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
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
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
    });
    return () => unsubscribe();
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
          if (owner) {
            setCurrentOwner(owner);
            setOwners(allOwners);
            if (owner.status === UserStatus.PENDING) {
              setLoading(false);
              return;
            }
            if (!owner.isActive) {
              setLoading(false);
              return;
            }
            if (owner.status === UserStatus.APPROVED && !isOwnerExpired(owner)) {
              setSession(savedSession);
              await loadOwnerData(savedSession.ownerId);
            } else {
              await Storage.saveSession(null);
            }
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

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; message: string; pending?: boolean; suspended?: boolean }> => {
    try {
      const allOwners = await Storage.getOwners();
      const owner = allOwners.find(o => o.email.toLowerCase() === email.toLowerCase());
      if (!owner) return { success: false, message: 'البريد الإلكتروني غير مسجل' };
      if (owner.password !== password) return { success: false, message: 'كلمة المرور غير صحيحة' };
      if (owner.status === UserStatus.PENDING) {
        setCurrentOwner(owner);
        setOwners(allOwners);
        await Storage.saveSession({ type: 'owner', ownerId: owner.id });
        return { success: false, message: 'حسابك قيد المراجعة من قبل المشرف', pending: true };
      }
      if (owner.status === UserStatus.REJECTED) return { success: false, message: 'تم رفض حسابك' };
      if (!owner.isActive) {
        setCurrentOwner(owner);
        setOwners(allOwners);
        await Storage.saveSession({ type: 'owner', ownerId: owner.id });
        return { success: false, message: 'تم تعطيل حسابك من قبل الإدارة', suspended: true };
      }
      if (isOwnerExpired(owner)) return { success: false, message: 'انتهت صلاحية حسابك، يرجى التواصل مع المشرف للتجديد' };

      const newSession: Session = { type: 'owner', ownerId: owner.id };
      await Storage.saveSession(newSession);
      setSession(newSession);
      setCurrentOwner(owner);
      setOwners(allOwners);
      await loadOwnerData(owner.id);
      return { success: true, message: '' };
    } catch (e) {
      console.error('Login error:', e);
      return { success: false, message: 'حدث خطأ أثناء تسجيل الدخول' };
    }
  }, []);

  const signup = useCallback(async (name: string, phone: string, email: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const allOwners = await Storage.getOwners();
      if (allOwners.some(o => o.email.toLowerCase() === email.toLowerCase())) {
        return { success: false, message: 'البريد الإلكتروني مسجل مسبقاً' };
      }
      const now = new Date().toISOString();
      const newOwner: Owner = {
        id: Crypto.randomUUID(),
        name, phone, email, password,
        status: UserStatus.PENDING,
        isActive: true,
        activatedAt: null,
        expiryDate: null,
        createdAt: now,
        updatedAt: now,
      };
      allOwners.push(newOwner);
      await Storage.saveOwners(allOwners);
      return { success: true, message: 'تم إنشاء حسابك بنجاح وهو قيد المراجعة' };
    } catch (e) {
      console.error('Signup error:', e);
      return { success: false, message: 'حدث خطأ أثناء إنشاء الحساب' };
    }
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
    try {
      const now = new Date().toISOString();
      const sub: Subscriber = { ...data, id: Crypto.randomUUID(), updatedAt: now };
      const updated = [...subscribers, sub];
      setSubscribers(updated);
      await Storage.saveSubscribers(currentOwner.id, updated);
    } catch (e) {
      console.error('Add subscriber error:', e);
      showToast('حدث خطأ أثناء إضافة المشترك');
    }
  }, [currentOwner, subscribers]);

  const updateSubscriber = useCallback(async (id: string, data: Partial<Omit<Subscriber, 'id'>>) => {
    if (!currentOwner) return;
    try {
      const now = new Date().toISOString();
      const updated = subscribers.map(s => s.id === id ? { ...s, ...data, updatedAt: now } : s);
      setSubscribers(updated);
      await Storage.saveSubscribers(currentOwner.id, updated);
    } catch (e) {
      console.error('Update subscriber error:', e);
      showToast('حدث خطأ أثناء تعديل المشترك');
    }
  }, [currentOwner, subscribers]);

  const deleteSubscriber = useCallback(async (id: string) => {
    if (!currentOwner) return;
    try {
      const updatedSubs = subscribers.filter(s => s.id !== id);
      setSubscribers(updatedSubs);
      await Storage.saveSubscribers(currentOwner.id, updatedSubs);
      const updatedPayments = payments.filter(p => p.subscriberId !== id);
      setPayments(updatedPayments);
      await Storage.savePayments(currentOwner.id, updatedPayments);
    } catch (e) {
      console.error('Delete subscriber error:', e);
      showToast('حدث خطأ أثناء حذف المشترك');
    }
  }, [currentOwner, subscribers, payments]);

  const setPricing = useCallback(async (month: string, prices: MonthlyPricing) => {
    if (!currentOwner) return;
    try {
      const updated = { ...pricing, [month]: prices };
      setPricingState(updated);
      await Storage.savePricing(currentOwner.id, updated);
    } catch (e) {
      console.error('Set pricing error:', e);
      showToast('حدث خطأ أثناء حفظ الأسعار');
    }
  }, [currentOwner, pricing]);

  const recordPayment = useCallback(async (subscriberId: string, month: string, amount: number, type: 'full' | 'partial') => {
    if (!currentOwner) return;
    try {
      const now = new Date().toISOString();
      const payment: Payment = {
        id: Crypto.randomUUID(),
        subscriberId, month, amount, type,
        date: now,
        updatedAt: now,
      };
      const updated = [...payments, payment];
      setPayments(updated);
      await Storage.savePayments(currentOwner.id, updated);
    } catch (e) {
      console.error('Record payment error:', e);
      showToast('حدث خطأ أثناء تسجيل الدفعة');
    }
  }, [currentOwner, payments]);

  const cancelPayment = useCallback(async (paymentId: string) => {
    if (!currentOwner) return;
    try {
      const updated = payments.filter(p => p.id !== paymentId);
      setPayments(updated);
      await Storage.savePayments(currentOwner.id, updated);
    } catch (e) {
      console.error('Cancel payment error:', e);
      showToast('حدث خطأ أثناء إلغاء الدفعة');
    }
  }, [currentOwner, payments]);

  const addExpense = useCallback(async (month: string, description: string, amount: number) => {
    if (!currentOwner) return;
    try {
      const now = new Date().toISOString();
      const expense: Expense = { id: Crypto.randomUUID(), month, description, amount, date: now, updatedAt: now };
      const updated = [...expenses, expense];
      setExpenses(updated);
      await Storage.saveExpenses(currentOwner.id, updated);
    } catch (e) {
      console.error('Add expense error:', e);
      showToast('حدث خطأ أثناء إضافة المصروف');
    }
  }, [currentOwner, expenses]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!currentOwner) return;
    try {
      const updated = expenses.filter(e => e.id !== id);
      setExpenses(updated);
      await Storage.saveExpenses(currentOwner.id, updated);
    } catch (e) {
      console.error('Delete expense error:', e);
      showToast('حدث خطأ أثناء حذف المصروف');
    }
  }, [currentOwner, expenses]);

  const approveOwner = useCallback(async (ownerId: string) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك');
        return;
      }
      const now = new Date();
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + 30);
      const updated = allOwners.map(o =>
        o.id === ownerId ? {
          ...o,
          status: UserStatus.APPROVED,
          isActive: true,
          activatedAt: now.toISOString(),
          expiryDate: expiry.toISOString(),
          updatedAt: now.toISOString(),
        } : o
      );
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(`تم قبول ${target.name} بنجاح`);
    } catch (e) {
      console.error('Approve owner error:', e);
      showToast('حدث خطأ أثناء قبول المالك');
    }
  }, []);

  const rejectOwner = useCallback(async (ownerId: string) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك');
        return;
      }
      const updated = allOwners.map(o =>
        o.id === ownerId ? { ...o, status: UserStatus.REJECTED, updatedAt: new Date().toISOString() } : o
      );
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(`تم رفض ${target.name}`);
    } catch (e) {
      console.error('Reject owner error:', e);
      showToast('حدث خطأ أثناء رفض المالك');
    }
  }, []);

  const deleteOwner = useCallback(async (ownerId: string) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك');
        return;
      }
      const updated = allOwners.filter(o => o.id !== ownerId);
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(`تم حذف ${target.name} بنجاح`);
    } catch (e) {
      console.error('Delete owner error:', e);
      showToast('حدث خطأ أثناء حذف المالك');
    }
  }, []);

  const renewOwner = useCallback(async (ownerId: string, months: number = 1) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك');
        return;
      }
      const updated = allOwners.map(o => {
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
          status: UserStatus.APPROVED,
          isActive: true,
          activatedAt: o.activatedAt || now.toISOString(),
          expiryDate: expiry.toISOString(),
          updatedAt: now.toISOString(),
        };
      });
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(`تم تجديد اشتراك ${target.name} لمدة ${months} شهر`);
    } catch (e) {
      console.error('Renew owner error:', e);
      showToast('حدث خطأ أثناء تجديد الاشتراك');
    }
  }, []);

  const toggleOwnerActive = useCallback(async (ownerId: string) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك');
        return;
      }
      const newActive = !target.isActive;
      const updated = allOwners.map(o =>
        o.id === ownerId ? { ...o, isActive: newActive, updatedAt: new Date().toISOString() } : o
      );
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(newActive ? `تم تفعيل حساب ${target.name}` : `تم تعطيل حساب ${target.name}`);
    } catch (e) {
      console.error('Toggle owner active error:', e);
      showToast('حدث خطأ أثناء تغيير حالة الحساب');
    }
  }, []);

  const refreshOwners = useCallback(async () => {
    try {
      const allOwners = await Storage.getOwners();
      setOwners(allOwners);
    } catch (e) {
      console.error('Refresh owners error:', e);
    }
  }, []);

  const refreshCurrentOwner = useCallback(async (): Promise<Owner | null> => {
    try {
      const allOwners = await Storage.getOwners();
      setOwners(allOwners);
      if (currentOwner) {
        const updated = allOwners.find(o => o.id === currentOwner.id);
        if (updated) {
          setCurrentOwner(updated);
          return updated;
        }
      }
      return null;
    } catch (e) {
      console.error('Refresh current owner error:', e);
      return null;
    }
  }, [currentOwner]);

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
    session, loading, isOnline, currentOwner, owners, subscribers, pricing, payments, expenses,
    login, signup, adminLogin, logout,
    addSubscriber, updateSubscriber, deleteSubscriber, setPricing,
    recordPayment, cancelPayment,
    addExpense, deleteExpense,
    approveOwner, rejectOwner, deleteOwner, renewOwner, toggleOwnerActive,
    refreshOwners, refreshCurrentOwner, getSubscriberPayments, getSubscriberDue, getSubscriberPaid,
  }), [
    session, loading, isOnline, currentOwner, owners, subscribers, pricing, payments, expenses,
    login, signup, adminLogin, logout,
    addSubscriber, updateSubscriber, deleteSubscriber, setPricing,
    recordPayment, cancelPayment,
    addExpense, deleteExpense,
    approveOwner, rejectOwner, deleteOwner, renewOwner, toggleOwnerActive,
    refreshOwners, refreshCurrentOwner, getSubscriberPayments, getSubscriberDue, getSubscriberPaid,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
