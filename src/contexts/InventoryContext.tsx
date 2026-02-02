import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Category, InventoryItem, User, Activity } from '@/types/inventory';
import { dbOperations, DatabaseError } from '@/lib/dbUtils';
import { showErrorNotification, showSuccessNotification } from '@/lib/notificationUtils';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
interface InventoryContextType {
  categories: Category[];
  items: InventoryItem[];
  users: User[];
  activities: Activity[];
  currentUser: User | null;
  loading: boolean;
  
  // Category management
  addCategory: (category: Omit<Category, 'id' | 'createdAt'>) => Promise<Category>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  loadCategories: () => Promise<void>;
  
  // Item management
  loadItems: () => Promise<void>;
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteItem: (id: string) => void;
  
  // User management
  setCurrentUser: (user: User) => void;
  
  // Activity tracking
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dbOperations.getCategories();
      
      const formattedCategories = data.map(cat => ({
        id: cat.id,
        name: cat.name,
        description: cat.description || '',
        color: cat.color,
        image_url: cat.image_url,
        createdAt: new Date(cat.created_at)
      }));

      setCategories(formattedCategories);
    } catch (error) {
      showErrorNotification(error, 'Failed to load categories');
    }
    setLoading(false);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dbOperations.getInventoryItems();
      
      const formattedItems = data.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        barcode: item.barcode,
        quantity: item.quantity,
        minQuantity: item.min_quantity || 0,
        maxQuantity: 100, // Default max quantity
        categoryId: item.category_id,
        location: item.location || '',
        price: item.unit_price || 0,
        createdAt: new Date(item.created_at),
        updatedAt: new Date(item.updated_at)
      }));

      setItems(formattedItems);
    } catch (error) {
      showErrorNotification(error, 'Failed to load inventory items');
    }
    setLoading(false);
  }, []);

  const loadUsers = useCallback(async () => {
    if (!userProfile?.company_id) return;
    
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, role, created_at')
        .eq('company_id', userProfile.company_id);
      
      if (error) throw error;
      
      const formattedUsers = (data || []).map(user => ({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`.trim() || user.email,
        email: user.email,
        role: user.role,
        createdAt: new Date(user.created_at)
      }));
      
      setUsers(formattedUsers);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }, [userProfile?.company_id]);

  const loadActivities = useCallback(async () => {
    if (!userProfile?.company_id) return;
    
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select(`
          id,
          user_id,
          action,
          details,
          timestamp,
          user:user_id (
            first_name,
            last_name
          )
        `)
        .eq('company_id', userProfile.company_id)
        .order('timestamp', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      const formattedActivities = (data || []).map(activity => ({
        id: activity.id,
        userId: activity.user_id,
        action: activity.action,
        itemId: activity.details?.item_id || '',
        details: activity.details?.description || activity.action,
        timestamp: new Date(activity.timestamp)
      }));
      
      setActivities(formattedActivities);
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  }, [userProfile?.company_id]);

  useEffect(() => {
    if (userProfile?.company_id) {
      loadCategories();
      loadItems();
      loadUsers();
      loadActivities();
    }
  }, [userProfile?.company_id, loadCategories, loadItems, loadUsers, loadActivities]);

  const addCategory = useCallback(async (categoryData: Omit<Category, 'id' | 'createdAt'>) => {
    try {
      if (!categoryData.company_id) {
        throw new Error('Company ID is required');
      }
      setLoading(true);
      console.log('Adding category:', categoryData);
      
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Current session:', session?.user?.email || 'No session');
      
      if (!session) {
        throw new Error('You must be logged in to create categories');
      }

      // Check if category already exists
      const existingCategory = categories.find(cat => 
        cat.name.toLowerCase() === categoryData.name.toLowerCase()
      );
      
      if (existingCategory) {
        throw new Error(`Category "${categoryData.name}" already exists`);
      }

      const data = await dbOperations.addCategory({
        name: categoryData.name,
        description: categoryData.description,
        color: categoryData.color,
        image_url: categoryData.image_url
      });

      const newCategory: Category = {
        id: data.id,
        name: data.name,
        description: data.description || '',
        color: data.color,
        image_url: data.image_url,
        createdAt: new Date(data.created_at)
      };

      setCategories(prev => [...prev, newCategory]);
      showSuccessNotification('Category created successfully');
      return newCategory;
    } catch (error) {
      console.error('Error adding category:', error);
      if (error instanceof Error && error.message.includes('duplicate key')) {
        showErrorNotification(new Error(`Category "${categoryData.name}" already exists`), 'Duplicate category name');
      } else {
        showErrorNotification(error, 'Failed to create category');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, [categories]);

  const updateCategory = useCallback(async (id: string, updates: Partial<Category>) => {
    try {
      await dbOperations.updateCategory(id, {
        name: updates.name,
        description: updates.description,
        color: updates.color,
        image_url: updates.image_url
      });

      setCategories(prev => prev.map(cat => 
        cat.id === id ? { ...cat, ...updates } : cat
      ));
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    try {
      await dbOperations.deleteCategory(id);
      setCategories(prev => prev.filter(cat => cat.id !== id));
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }, []);

  const addItem = useCallback((itemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setItems(prev => [...prev, newItem]);
    addActivity({
      userId: currentUser?.id || '1',
      action: 'ADD_ITEM',
      itemId: newItem.id,
      details: `Added item: ${newItem.name}`
    });
  }, [currentUser]);

  const updateItem = useCallback((id: string, updates: Partial<InventoryItem>) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates, updatedAt: new Date() } : item
    ));
    addActivity({
      userId: currentUser?.id || '1',
      action: 'UPDATE_ITEM',
      itemId: id,
      details: `Updated item`
    });
  }, [currentUser]);

  const deleteItem = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    setItems(prev => prev.filter(item => item.id !== id));
    addActivity({
      userId: currentUser?.id || '1',
      action: 'DELETE_ITEM',
      itemId: id,
      details: `Deleted item: ${item?.name || 'Unknown'}`
    });
  }, [items, currentUser]);

  const addActivity = useCallback((activityData: Omit<Activity, 'id' | 'timestamp'>) => {
    const newActivity: Activity = {
      ...activityData,
      id: Date.now().toString(),
      timestamp: new Date()
    };
    setActivities(prev => [newActivity, ...prev].slice(0, 100));
  }, []);

  return (
    <InventoryContext.Provider value={{
      categories,
      items,
      users,
      activities,
      currentUser,
      loading,
      addCategory,
      updateCategory,
      deleteCategory,
      loadCategories,
      loadItems,
      addItem,
      updateItem,
      deleteItem,
      setCurrentUser,
      addActivity
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within InventoryProvider');
  }
  return context;
};