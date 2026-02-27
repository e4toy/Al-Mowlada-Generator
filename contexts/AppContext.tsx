import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { useAlert } from '@/components/CustomAlert';
import {
  Storage, Owner, Subscriber, MonthlyPricing, Payment, Expense, Session,
  UserStatus, ADMIN_EMAIL, ADMIN_PASSWORD, isOwnerExpired, getOwnerExpiryDate,
} from '@/lib/storage';
import {
  syncOwnerToServer, syncOwnerUpdate, syncFullData, syncDelete,
  fetchOwnersFromServer, fetchOwnerFromServer, fetchOwnerDataFromServer,
  processPendingSyncActions, loginOnServer, deleteOwnerOnServer,
} from '@/lib/sync';

interface AppContextValue {
  session: Session;
  loading: boolean;
  isOnline: boolean;
  isSyncing: boolean;
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
  syncNow: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const alert = useAlert();
  const alertRef = useRef(alert);
  alertRef.current = alert;

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (type === 'error') {
      alertRef.current.showError(message);
    } else {
      alertRef.current.showSuccess(message);
    }
  }

  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [currentOwner, setCurrentOwner] = useState<Owner | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [pricing, setPricingState] = useState<Record<string, MonthlyPricing>>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const backgroundTimeRef = useRef<number | null>(null);
  const isOnlineRef = useRef(true);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected ?? true;
      const wasOffline = !isOnlineRef.current;
      isOnlineRef.current = online;
      setIsOnline(online);
      if (online && wasOffline) {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          triggerSync();
        }, 2000);
      }
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
      if (elapsed > 3600000) {
        logout();
      }
    }
  }, [session]);

  async function triggerSync() {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      const savedSession = await Storage.getSession();
      if (savedSession?.type === 'owner' && savedSession.ownerId) {
        const owner = (await Storage.getOwners()).find(o => o.id === savedSession.ownerId);
        if (owner) {
          await syncOwnerToServer(owner);
          const [subs, prc, pays, exps] = await Promise.all([
            Storage.getSubscribers(savedSession.ownerId),
            Storage.getPricing(savedSession.ownerId),
            Storage.getPayments(savedSession.ownerId),
            Storage.getExpenses(savedSession.ownerId),
          ]);
          await syncFullData(savedSession.ownerId, subs, pays, exps, prc);
          await processPendingSyncActions(savedSession.ownerId);
        }
      } else if (savedSession?.type === 'admin') {
        const localOwners = await Storage.getOwners();
        for (const owner of localOwners) {
          await syncOwnerToServer(owner);
        }
      }
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setIsSyncing(false);
    }
  }

  const syncNow = useCallback(async () => {
    await triggerSync();
  }, []);

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
      let owner = allOwners.find(o => o.email.toLowerCase() === email.toLowerCase());

      if (!owner && isOnlineRef.current) {
        const serverResult = await loginOnServer(email, password);
        if (serverResult.success && serverResult.owner) {
          const serverOwner: Owner = serverResult.owner;
          allOwners.push(serverOwner);
          await Storage.saveOwners(allOwners);
          owner = serverOwner;
        } else if (!serverResult.success) {
          return { success: false, message: serverResult.message || 'البريد الإلكتروني غير مسجل' };
        }
      }

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

      if (isOnlineRef.current) {
        const serverData = await fetchOwnerDataFromServer(owner.id);
        if (serverData) {
          const localSubs = await Storage.getSubscribers(owner.id);
          if (localSubs.length === 0 && serverData.subscribers.length > 0) {
            await Storage.saveSubscribers(owner.id, serverData.subscribers);
            await Storage.savePayments(owner.id, serverData.payments);
            await Storage.saveExpenses(owner.id, serverData.expenses);
            await Storage.savePricing(owner.id, serverData.pricing);
            setSubscribers(serverData.subscribers);
            setPayments(serverData.payments);
            setExpenses(serverData.expenses);
            setPricingState(serverData.pricing);
          }
        }
      }

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

      if (isOnlineRef.current) {
        await syncOwnerToServer(newOwner);
      }

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

      if (isOnlineRef.current) {
        try {
          const serverOwners = await fetchOwnersFromServer();
          if (serverOwners.length > 0) {
            const localOwners = await Storage.getOwners();
            const mergedMap = new Map<string, Owner>();
            for (const o of localOwners) mergedMap.set(o.id, o);
            for (const o of serverOwners) {
              const local = mergedMap.get(o.id);
              if (!local || new Date(o.updatedAt) > new Date(local.updatedAt)) {
                mergedMap.set(o.id, o);
              }
            }
            const merged = Array.from(mergedMap.values());
            await Storage.saveOwners(merged);
            setOwners(merged);
          } else {
            const allOwners = await Storage.getOwners();
            setOwners(allOwners);
            for (const owner of allOwners) {
              await syncOwnerToServer(owner);
            }
          }
        } catch {
          const allOwners = await Storage.getOwners();
          setOwners(allOwners);
        }
      } else {
        const allOwners = await Storage.getOwners();
        setOwners(allOwners);
      }

      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    if (isOnlineRef.current && currentOwner) {
      try {
        const [subs, prc, pays, exps] = await Promise.all([
          Storage.getSubscribers(currentOwner.id),
          Storage.getPricing(currentOwner.id),
          Storage.getPayments(currentOwner.id),
          Storage.getExpenses(currentOwner.id),
        ]);
        await syncFullData(currentOwner.id, subs, pays, exps, prc);
      } catch (e) {
        console.error('Sync on logout error:', e);
      }
    }

    await Storage.saveSession(null);
    setSession(null);
    setCurrentOwner(null);
    setSubscribers([]);
    setPricingState({});
    setPayments([]);
    setExpenses([]);
  }, [currentOwner]);

  const addSubscriber = useCallback(async (data: Omit<Subscriber, 'id'>) => {
    if (!currentOwner) return;
    try {
      const now = new Date().toISOString();
      const sub: Subscriber = { ...data, id: Crypto.randomUUID(), updatedAt: now };
      const updated = [...subscribers, sub];
      setSubscribers(updated);
      await Storage.saveSubscribers(currentOwner.id, updated);
      if (isOnlineRef.current) {
        syncFullData(currentOwner.id, updated, payments, expenses, pricing).catch(() => {});
      }
    } catch (e) {
      console.error('Add subscriber error:', e);
      showToast('حدث خطأ أثناء إضافة المشترك', 'error');
    }
  }, [currentOwner, subscribers, payments, expenses, pricing]);

  const updateSubscriber = useCallback(async (id: string, data: Partial<Omit<Subscriber, 'id'>>) => {
    if (!currentOwner) return;
    try {
      const now = new Date().toISOString();
      const updated = subscribers.map(s => s.id === id ? { ...s, ...data, updatedAt: now } : s);
      setSubscribers(updated);
      await Storage.saveSubscribers(currentOwner.id, updated);
      if (isOnlineRef.current) {
        syncFullData(currentOwner.id, updated, payments, expenses, pricing).catch(() => {});
      }
    } catch (e) {
      console.error('Update subscriber error:', e);
      showToast('حدث خطأ أثناء تعديل المشترك', 'error');
    }
  }, [currentOwner, subscribers, payments, expenses, pricing]);

  const deleteSubscriber = useCallback(async (id: string) => {
    if (!currentOwner) return;
    try {
      const updatedSubs = subscribers.filter(s => s.id !== id);
      setSubscribers(updatedSubs);
      await Storage.saveSubscribers(currentOwner.id, updatedSubs);
      const updatedPayments = payments.filter(p => p.subscriberId !== id);
      setPayments(updatedPayments);
      await Storage.savePayments(currentOwner.id, updatedPayments);
      if (isOnlineRef.current) {
        syncDelete('subscriber', id, currentOwner.id).catch(() => {});
      } else {
        await Storage.addSyncAction({
          id: Crypto.randomUUID(),
          type: 'delete',
          entity: 'subscriber',
          data: { id },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('Delete subscriber error:', e);
      showToast('حدث خطأ أثناء حذف المشترك', 'error');
    }
  }, [currentOwner, subscribers, payments]);

  const setPricing = useCallback(async (month: string, prices: MonthlyPricing) => {
    if (!currentOwner) return;
    try {
      const updated = { ...pricing, [month]: prices };
      setPricingState(updated);
      await Storage.savePricing(currentOwner.id, updated);
      if (isOnlineRef.current) {
        syncFullData(currentOwner.id, subscribers, payments, expenses, updated).catch(() => {});
      }
    } catch (e) {
      console.error('Set pricing error:', e);
      showToast('حدث خطأ أثناء حفظ الأسعار', 'error');
    }
  }, [currentOwner, pricing, subscribers, payments, expenses]);

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
      if (isOnlineRef.current) {
        syncFullData(currentOwner.id, subscribers, updated, expenses, pricing).catch(() => {});
      }
    } catch (e) {
      console.error('Record payment error:', e);
      showToast('حدث خطأ أثناء تسجيل الدفعة', 'error');
    }
  }, [currentOwner, payments, subscribers, expenses, pricing]);

  const cancelPayment = useCallback(async (paymentId: string) => {
    if (!currentOwner) return;
    try {
      const updated = payments.filter(p => p.id !== paymentId);
      setPayments(updated);
      await Storage.savePayments(currentOwner.id, updated);
      if (isOnlineRef.current) {
        syncDelete('payment', paymentId, currentOwner.id).catch(() => {});
      } else {
        await Storage.addSyncAction({
          id: Crypto.randomUUID(),
          type: 'delete',
          entity: 'payment',
          data: { id: paymentId },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('Cancel payment error:', e);
      showToast('حدث خطأ أثناء إلغاء الدفعة', 'error');
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
      if (isOnlineRef.current) {
        syncFullData(currentOwner.id, subscribers, payments, updated, pricing).catch(() => {});
      }
    } catch (e) {
      console.error('Add expense error:', e);
      showToast('حدث خطأ أثناء إضافة المصروف', 'error');
    }
  }, [currentOwner, expenses, subscribers, payments, pricing]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!currentOwner) return;
    try {
      const updated = expenses.filter(e => e.id !== id);
      setExpenses(updated);
      await Storage.saveExpenses(currentOwner.id, updated);
      if (isOnlineRef.current) {
        syncDelete('expense', id, currentOwner.id).catch(() => {});
      } else {
        await Storage.addSyncAction({
          id: Crypto.randomUUID(),
          type: 'delete',
          entity: 'expense',
          data: { id },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('Delete expense error:', e);
      showToast('حدث خطأ أثناء حذف المصروف', 'error');
    }
  }, [currentOwner, expenses, subscribers, payments, pricing]);

  const approveOwner = useCallback(async (ownerId: string) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك', 'error');
        return;
      }
      const now = new Date();
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + 30);
      const updatedOwner = {
        ...target,
        status: UserStatus.APPROVED,
        isActive: true,
        activatedAt: now.toISOString(),
        expiryDate: expiry.toISOString(),
        updatedAt: now.toISOString(),
      };
      const updated = allOwners.map(o => o.id === ownerId ? updatedOwner : o);
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(`تم قبول ${target.name} بنجاح`);
      if (isOnlineRef.current) {
        syncOwnerUpdate(updatedOwner).catch(() => {});
      }
    } catch (e) {
      console.error('Approve owner error:', e);
      showToast('حدث خطأ أثناء قبول المالك', 'error');
    }
  }, []);

  const rejectOwner = useCallback(async (ownerId: string) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك', 'error');
        return;
      }
      const updatedOwner = { ...target, status: UserStatus.REJECTED, updatedAt: new Date().toISOString() };
      const updated = allOwners.map(o => o.id === ownerId ? updatedOwner : o);
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(`تم رفض ${target.name}`);
      if (isOnlineRef.current) {
        syncOwnerUpdate(updatedOwner).catch(() => {});
      }
    } catch (e) {
      console.error('Reject owner error:', e);
      showToast('حدث خطأ أثناء رفض المالك', 'error');
    }
  }, []);

  const deleteOwner = useCallback(async (ownerId: string) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك', 'error');
        return;
      }
      const updated = allOwners.filter(o => o.id !== ownerId);
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(`تم حذف ${target.name} بنجاح`);
      if (isOnlineRef.current) {
        deleteOwnerOnServer(ownerId).catch(() => {});
      }
    } catch (e) {
      console.error('Delete owner error:', e);
      showToast('حدث خطأ أثناء حذف المالك', 'error');
    }
  }, []);

  const renewOwner = useCallback(async (ownerId: string, months: number = 1) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك', 'error');
        return;
      }
      const now = new Date();
      let baseDate = now;
      if (target.expiryDate) {
        const existing = new Date(target.expiryDate);
        if (existing > now) baseDate = existing;
      }
      const expiry = new Date(baseDate);
      expiry.setDate(expiry.getDate() + (months * 30));
      const updatedOwner = {
        ...target,
        status: UserStatus.APPROVED,
        isActive: true,
        activatedAt: target.activatedAt || now.toISOString(),
        expiryDate: expiry.toISOString(),
        updatedAt: now.toISOString(),
      };
      const updated = allOwners.map(o => o.id !== ownerId ? o : updatedOwner);
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(`تم تجديد اشتراك ${target.name} لمدة ${months} شهر`);
      if (isOnlineRef.current) {
        syncOwnerUpdate(updatedOwner).catch(() => {});
      }
    } catch (e) {
      console.error('Renew owner error:', e);
      showToast('حدث خطأ أثناء تجديد الاشتراك', 'error');
    }
  }, []);

  const toggleOwnerActive = useCallback(async (ownerId: string) => {
    try {
      const allOwners = await Storage.getOwners();
      const target = allOwners.find(o => o.id === ownerId);
      if (!target) {
        showToast('لم يتم العثور على المالك', 'error');
        return;
      }
      const newActive = !target.isActive;
      const updatedOwner = { ...target, isActive: newActive, updatedAt: new Date().toISOString() };
      const updated = allOwners.map(o => o.id === ownerId ? updatedOwner : o);
      await Storage.saveOwners(updated);
      setOwners(updated);
      showToast(newActive ? `تم تفعيل حساب ${target.name}` : `تم تعطيل حساب ${target.name}`);
      if (isOnlineRef.current) {
        syncOwnerUpdate(updatedOwner).catch(() => {});
      }
    } catch (e) {
      console.error('Toggle owner active error:', e);
      showToast('حدث خطأ أثناء تغيير حالة الحساب', 'error');
    }
  }, []);

  const refreshOwners = useCallback(async () => {
    try {
      if (isOnlineRef.current) {
        const serverOwners = await fetchOwnersFromServer();
        if (serverOwners.length > 0) {
          const localOwners = await Storage.getOwners();
          const mergedMap = new Map<string, Owner>();
          for (const o of localOwners) mergedMap.set(o.id, o);
          for (const o of serverOwners) {
            const local = mergedMap.get(o.id);
            if (!local || new Date(o.updatedAt) > new Date(local.updatedAt)) {
              mergedMap.set(o.id, o);
            }
          }
          const merged = Array.from(mergedMap.values());
          await Storage.saveOwners(merged);
          setOwners(merged);
          return;
        }
      }
      const allOwners = await Storage.getOwners();
      setOwners(allOwners);
    } catch (e) {
      console.error('Refresh owners error:', e);
      const allOwners = await Storage.getOwners();
      setOwners(allOwners);
    }
  }, []);

  const refreshCurrentOwner = useCallback(async (): Promise<Owner | null> => {
    try {
      if (isOnlineRef.current && currentOwner) {
        const serverOwner = await fetchOwnerFromServer(currentOwner.id);
        if (serverOwner) {
          const allOwners = await Storage.getOwners();
          const updated = allOwners.map(o => o.id === serverOwner.id ? serverOwner : o);
          await Storage.saveOwners(updated);
          setOwners(updated);
          setCurrentOwner(serverOwner);
          return serverOwner;
        }
      }

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
    session, loading, isOnline, isSyncing, currentOwner, owners, subscribers, pricing, payments, expenses,
    login, signup, adminLogin, logout,
    addSubscriber, updateSubscriber, deleteSubscriber, setPricing,
    recordPayment, cancelPayment,
    addExpense, deleteExpense,
    approveOwner, rejectOwner, deleteOwner, renewOwner, toggleOwnerActive,
    refreshOwners, refreshCurrentOwner, getSubscriberPayments, getSubscriberDue, getSubscriberPaid,
    syncNow,
  }), [
    session, loading, isOnline, isSyncing, currentOwner, owners, subscribers, pricing, payments, expenses,
    login, signup, adminLogin, logout,
    addSubscriber, updateSubscriber, deleteSubscriber, setPricing,
    recordPayment, cancelPayment,
    addExpense, deleteExpense,
    approveOwner, rejectOwner, deleteOwner, renewOwner, toggleOwnerActive,
    refreshOwners, refreshCurrentOwner, getSubscriberPayments, getSubscriberDue, getSubscriberPaid,
    syncNow,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
