export interface Category {
  id: string;
  name: string;
  description?: string;
  color: string;
  image_url?: string;
  company_id: string;
  createdAt: Date;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  barcode?: string;
  quantity: number;
  minQuantity: number;
  price: number;
  location: string;
  image_url?: string;
  userId?: string; // For individual user inventory
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

export interface Activity {
  id: string;
  userId: string;
  action: string;
  itemId?: string;
  details: string;
  timestamp: Date;
}

export type ViewMode = 'admin' | 'mobile';