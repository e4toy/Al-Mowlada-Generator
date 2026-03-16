import { getApiUrl } from './query-client';
import { Storage, Owner, Subscriber, Payment, Expense, MonthlyPricing, SyncAction } from './storage';
import { fetch } from 'expo/fetch';

async function apiCall(method: string, path: string, body?: unknown): Promise<any> {
  const baseUrl = getApiUrl();
  const url = new URL(path, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncOwnerToServer(owner: Owner): Promise<boolean> {
  try {
    await apiCall('POST', '/api/owners/signup', owner);
    return true;
  } catch (e: any) {
    if (e.message?.includes('409')) {
      try {
        await apiCall('PUT', `/api/owners/${owner.id}`, owner);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export async function syncOwnerUpdate(owner: Owner): Promise<boolean> {
  try {
    await apiCall('PUT', `/api/owners/${owner.id}`, owner);
    return true;
  } catch {
    return false;
  }
}

export async function syncFullData(
  ownerId: string,
  subscribers: Subscriber[],
  payments: Payment[],
  expenses: Expense[],
  pricing: Record<string, MonthlyPricing>,
): Promise<boolean> {
  try {
    await apiCall('POST', '/api/sync', {
      ownerId,
      subscribers,
      payments,
      expenses,
      pricing,
    });
    return true;
  } catch (e) {
    console.error('Full sync error:', e);
    return false;
  }
}

export async function syncDelete(entity: string, id: string, ownerId: string): Promise<boolean> {
  try {
    await apiCall('POST', '/api/sync/delete', { entity, id, ownerId });
    return true;
  } catch {
    return false;
  }
}

export async function fetchOwnersFromServer(): Promise<Owner[]> {
  try {
    const data = await apiCall('GET', '/api/owners');
    return data.map((o: any) => ({
      id: o.id,
      name: o.name,
      phone: o.phone,
      email: o.email,
      password: o.password,
      status: o.status,
      isActive: o.isActive,
      activatedAt: o.activatedAt,
      expiryDate: o.expiryDate,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));
  } catch (e) {
    console.error('Fetch owners error:', e);
    return [];
  }
}

export async function fetchOwnerFromServer(ownerId: string): Promise<Owner | null> {
  try {
    const o = await apiCall('GET', `/api/owners/${ownerId}`);
    return {
      id: o.id,
      name: o.name,
      phone: o.phone,
      email: o.email,
      password: o.password,
      status: o.status,
      isActive: o.isActive,
      activatedAt: o.activatedAt,
      expiryDate: o.expiryDate,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function fetchOwnerDataFromServer(ownerId: string): Promise<{
  subscribers: Subscriber[];
  payments: Payment[];
  expenses: Expense[];
  pricing: Record<string, MonthlyPricing>;
} | null> {
  try {
    return await apiCall('GET', `/api/owners/${ownerId}/data`);
  } catch {
    return null;
  }
}

export async function processPendingSyncActions(ownerId: string): Promise<void> {
  const actions = await Storage.getPendingSync();
  if (actions.length === 0) return;

  const processed: string[] = [];

  for (const action of actions) {
    try {
      if (action.type === 'delete') {
        const success = await syncDelete(action.entity, (action.data as any).id, ownerId);
        if (success) processed.push(action.id);
      } else if (action.type === 'add' && action.entity === 'owner') {
        const success = await syncOwnerToServer(action.data as Owner);
        if (success) processed.push(action.id);
      }
    } catch {
      continue;
    }
  }

  if (processed.length > 0) {
    const remaining = actions.filter(a => !processed.includes(a.id));
    await Storage.savePendingSync(remaining);
  }
}

export async function loginOnServer(email: string, password: string): Promise<{ success: boolean; owner?: Owner; message?: string }> {
  try {
    const result = await apiCall('POST', '/api/owners/login', { email, password });
    return { success: true, owner: result.owner };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteOwnerOnServer(ownerId: string): Promise<boolean> {
  try {
    await apiCall('DELETE', `/api/owners/${ownerId}`);
    return true;
  } catch {
    return false;
  }
}
