// Mock data to avoid Supabase API errors during development
export const mockInventoryItems = [
  { id: '1', name: 'Capacitor 35/5 MFD', quantity: 15, category: 'Electrical', barcode: '123456789' },
  { id: '2', name: 'Contactor 30A', quantity: 8, category: 'Electrical', barcode: '987654321' },
  { id: '3', name: 'Filter 16x25x1', quantity: 25, category: 'Filters', barcode: '456789123' },
  { id: '4', name: 'Refrigerant R-410A', quantity: 3, category: 'Refrigerant', barcode: '789123456' },
  { id: '5', name: 'Thermostat Wire 18/8', quantity: 12, category: 'Electrical', barcode: '321654987' }
];

export const mockCategories = [
  { name: 'Electrical' },
  { name: 'Filters' },
  { name: 'Refrigerant' },
  { name: 'Tools' },
  { name: 'Hardware' }
];

export const mockRefrigerantRecords = [
  {
    id: '1',
    job_number: 'JOB-2024-001',
    refrigerant_type: 'R-410A',
    amount_used: 2.5,
    amount_recovered: 1.0,
    unit: 'lbs',
    date_recorded: '2024-01-15T10:30:00Z',
    tech_name: 'John Smith',
    notes: 'System recharge after leak repair'
  },
  {
    id: '2',
    job_number: 'JOB-2024-002',
    refrigerant_type: 'R-22',
    amount_used: 1.8,
    amount_recovered: 0.5,
    unit: 'lbs',
    date_recorded: '2024-01-14T14:15:00Z',
    tech_name: 'Mike Johnson',
    notes: 'Partial system replacement'
  }
];