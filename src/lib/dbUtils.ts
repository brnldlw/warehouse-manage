import { supabase } from './supabase';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000
};

export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay } = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries!; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) break;

      // Don't retry on auth errors or permanent failures
      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as any).message?.toLowerCase() || '';
        if (message.includes('invalid api key') || 
            message.includes('unauthorized') ||
            message.includes('forbidden')) {
          throw new DatabaseError(
            'Authentication failed. Please check your API credentials.',
            'AUTH_ERROR',
            error
          );
        }
      }

      const delayMs = Math.min(baseDelay! * Math.pow(2, attempt), maxDelay!);
      await delay(delayMs);
    }
  }

  throw new DatabaseError(
    `Operation failed after ${maxRetries} retries: ${lastError.message}`,
    'MAX_RETRIES_EXCEEDED',
    lastError
  );
}

export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T; error: any }>,
  options?: RetryOptions
): Promise<T> {
  return withRetry(async () => {
    const { data, error } = await queryFn();
    
    if (error) {
      throw new DatabaseError(
        error.message || 'Database query failed',
        error.code,
        error
      );
    }

    return data;
  }, options);
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  created_at?: string;
  updated_at?: string;
  image_url?: string;
  company_id: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  barcode?: string;
  quantity: number;
  min_quantity?: number;
  category_id?: string;
  location?: string;
  unit_price?: number;
  supplier?: string;
  created_at?: string;
  updated_at?: string;
  image_url?: string;
  company_id: string;
}

export interface StockRequest {
  id: string;
  user_id: string;
  job_number: string;
  notes?: string;
  items: any;
  status: string;
  created_at?: string;
  fulfilled_at?: string;
  received_at?: string;
}

export interface Truck {
  id: string;
  name: string;
  identifier: string;
  company_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  company_id?: string;
  phone?: string;
  specialty?: string;
  is_active?: boolean;
}

export interface UserTruckAssignment {
  id: string;
  user_id: string;
  truck_id: string;
  assigned_at?: string;
  assigned_by?: string;
  company_id?: string;
}

export const dbOperations = {
  async getCategories(): Promise<Category[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profileData?.company_id) return [];

    const companyId = profileData.company_id;

    return safeQuery(async () => {
      const result = await supabase
        .from('categories')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      return result;
    });
  },

  async getInventoryItems(): Promise<InventoryItem[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profileData?.company_id) return [];

    const companyId = profileData.company_id;
    
    return safeQuery(async () => {
      const result = await supabase
        .from('inventory_items')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      return result;
    });
  },

  async addCategory(categoryData: Partial<Category>): Promise<Category> {
    if (!categoryData.company_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profileData?.company_id) throw new Error('No company associated with user');
      categoryData.company_id = profileData.company_id;
    }

    return safeQuery(async () => {
      const result = await supabase
        .from('categories')
        .insert([{
          ...categoryData,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      return result;
    });
  },

  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    return safeQuery(async () => {
      const result = await supabase
        .from('categories')
        .update(updates)
        .eq('id', id);
      return result;
    });
  },

  async deleteCategory(id: string): Promise<void> {
    return safeQuery(async () => {
      const result = await supabase
        .from('categories')
        .delete()
        .eq('id', id);
      return result;
    });
  },

  async getStockRequests(filters: {
    dateFrom?: string;
    dateTo?: string;
    truckFilter?: string;
  } = {}): Promise<StockRequest[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profileData?.company_id) return [];

    return safeQuery(async () => {
      let query = supabase
        .from('stock_requests')
        .select('*')
        .eq('company_id', profileData.company_id);
      
      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
      if (filters.truckFilter) query = query.eq('truck_id', filters.truckFilter);
      
      const result = await query;
      return result;
    });
  },

  async getTrucks(): Promise<Truck[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profileData?.company_id) return [];

    return safeQuery(async () => {
      const result = await supabase
        .from('trucks')
        .select('*')
        .eq('company_id', profileData.company_id);
      return result;
    });
  },

  async getUserProfiles(): Promise<UserProfile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profileData?.company_id) return [];

    return safeQuery(async () => {
      const result = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', profileData.company_id)
        .eq('role', 'tech');
      return result;
    });
  },

  async getUserTruckAssignments(): Promise<UserTruckAssignment[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profileData?.company_id) return [];

    return safeQuery(async () => {
      const result = await supabase
        .from('user_truck_assignments')
        .select('*')
        .eq('company_id', profileData.company_id);
      return result;
    });
  },

  async addUserTruckAssignment(assignment: Partial<UserTruckAssignment>): Promise<UserTruckAssignment> {
    if (!assignment.company_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profileData?.company_id) throw new Error('No company associated with user');
      assignment.company_id = profileData.company_id;
    }

    return safeQuery(async () => {
      const result = await supabase
        .from('user_truck_assignments')
        .insert([assignment])
        .select()
        .single();
      return result;
    });
  },

  async removeUserTruckAssignment(id: string): Promise<void> {
    return safeQuery(async () => {
      const result = await supabase
        .from('user_truck_assignments')
        .delete()
        .eq('id', id);
      return result;
    });
  }
};