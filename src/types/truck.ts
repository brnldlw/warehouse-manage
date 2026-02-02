export interface Truck {
  id: string;
  name: string;
  identifier: string;
  company_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface TruckAssignment {
  id: string;
  user_id: string;
  truck_id: string;
  assigned_at: Date;
  assigned_by: string;
}

export interface TruckInventoryItem {
  id: string;
  truck_id: string;
  item_id: string;
  quantity: number;
  location_in_truck: string;
  last_updated: Date;
}