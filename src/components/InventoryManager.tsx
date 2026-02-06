import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { InventoryItem, Category } from '@/types/inventory';
import { useInventory } from '@/contexts/InventoryContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Package, Plus, Trash2, Upload, Image, X, Edit, 
  ArrowRightLeft, Warehouse, Truck, Search,
  ChevronDown, ChevronUp, MoreHorizontal, Loader2
} from 'lucide-react';
import { BulkImport } from './BulkImport';
import { uploadItemImage, deleteItemImage, validateImageFile } from '@/lib/imageUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TruckOption {
  id: string;
  name: string;
  identifier: string;
}

export const InventoryManager: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [trucks, setTrucks] = useState<TruckOption[]>([]);
  const { categories, loading: categoriesLoading } = useInventory();
  const { userProfile } = useAuth();
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    barcode: '',
    serialNumber: '',
    condition: 'good' as 'good' | 'fair' | 'poor' | 'damaged',
    locationType: 'warehouse' as 'warehouse' | 'truck',
    assignedTruckId: '',
    price: 0,
    image: null as File | null
  });
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    barcode: '',
    serialNumber: '',
    condition: 'good' as 'good' | 'fair' | 'poor' | 'damaged',
    price: 0,
    image: null as File | null
  });
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  const [transferTo, setTransferTo] = useState<{ type: 'warehouse' | 'truck'; truckId?: string }>({ type: 'warehouse' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState<'all' | 'warehouse' | 'truck'>('all');
  const [filterTruck, setFilterTruck] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<'name' | 'location' | 'condition' | 'category'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadPageData();
  }, []);

  const loadPageData = async () => {
    setPageLoading(true);
    try {
      await Promise.all([loadItems(), loadTrucks()]);
    } finally {
      setPageLoading(false);
    }
  };

  const loadTrucks = async () => {
    try {
      if (!userProfile?.company_id) return;

      const { data, error } = await supabase
        .from('trucks')
        .select('id, name, identifier')
        .eq('company_id', userProfile.company_id)
        .order('name');

      if (error) throw error;
      setTrucks(data || []);
    } catch (error) {
      console.error('Error loading trucks:', error);
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profileData?.company_id) return;

      const companyId = profileData.company_id;

      // Load items with truck info
      const { data, error } = await supabase
        .from('inventory_items')
        .select(`
          *,
          trucks:assigned_truck_id (name, identifier)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const transformedItems = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        categoryId: item.category_id,
        barcode: item.barcode,
        quantity: item.quantity || 1,
        minQuantity: item.min_quantity || 0,
        price: item.unit_price,
        location: item.location,
        image_url: item.image_url,
        userId: item.user_id,
        createdAt: new Date(item.created_at),
        updatedAt: new Date(item.updated_at),
        // New transferable fields
        serialNumber: item.serial_number,
        condition: item.condition || 'good',
        locationType: item.location_type || 'warehouse',
        assignedTruckId: item.assigned_truck_id,
        assignedTruckName: item.trucks?.name,
        assignedAt: item.assigned_at ? new Date(item.assigned_at) : undefined,
        assignedBy: item.assigned_by
      }));
      
      setItems(transformedItems);
    } catch (error) {
      console.error('Error loading inventory items:', error);
      toast({
        title: "Error",
        description: "Failed to load inventory items",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const checkForDuplicate = async (serialNumber: string | null, barcode: string | null, excludeId?: string) => {
    if (!userProfile?.company_id) return null;

    // Check for duplicate serial number
    if (serialNumber) {
      const { data: serialCheck } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('company_id', userProfile.company_id)
        .eq('serial_number', serialNumber)
        .neq('id', excludeId || '')
        .single();

      if (serialCheck) return { field: 'serial_number', value: serialNumber };
    }

    // Check for duplicate barcode
    if (barcode) {
      const { data: barcodeCheck } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('company_id', userProfile.company_id)
        .eq('barcode', barcode)
        .neq('id', excludeId || '')
        .single();

      if (barcodeCheck) return { field: 'barcode', value: barcode };
    }

    return null;
  };

  const addItem = async () => {
    if (!itemForm.name || !itemForm.categoryId) {
      toast({
        title: "Error",
        description: "Please fill in item name and category",
        variant: "destructive"
      });
      return;
    }

    if (itemForm.locationType === 'truck' && !itemForm.assignedTruckId) {
      toast({
        title: "Error",
        description: "Please select a truck for truck location",
        variant: "destructive"
      });
      return;
    }

    const barcode = itemForm.barcode.trim() || null;
    const serialNumber = itemForm.serialNumber.trim() || null;

    const duplicate = await checkForDuplicate(serialNumber, barcode);
    if (duplicate) {
      toast({
        title: "Error",
        description: `Item with this ${duplicate.field === 'serial_number' ? 'serial number' : 'barcode'} already exists`,
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !userProfile?.company_id) {
        toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
        return;
      }

      const itemData = {
        name: itemForm.name.trim(),
        description: itemForm.description,
        category_id: itemForm.categoryId,
        barcode: barcode,
        serial_number: serialNumber,
        condition: itemForm.condition,
        location_type: itemForm.locationType,
        assigned_truck_id: itemForm.locationType === 'truck' ? itemForm.assignedTruckId : null,
        assigned_at: itemForm.locationType === 'truck' ? new Date().toISOString() : null,
        assigned_by: itemForm.locationType === 'truck' ? user.id : null,
        quantity: 1,
        min_quantity: 0,
        unit_price: itemForm.price,
        location: itemForm.locationType === 'warehouse' ? 'Warehouse' : null,
        company_id: userProfile.company_id
      };

      const { data, error } = await supabase
        .from('inventory_items')
        .insert([itemData])
        .select(`
          *,
          trucks:assigned_truck_id (name, identifier)
        `)
        .single();

      if (error) throw error;

      let imageUrl = null;
      if (itemForm.image) {
        const validation = validateImageFile(itemForm.image);
        if (validation.valid) {
          imageUrl = await uploadItemImage(itemForm.image, data.id);
          if (imageUrl) {
            await supabase
              .from('inventory_items')
              .update({ image_url: imageUrl })
              .eq('id', data.id);
          }
        }
      }
      
      // Log activity
      const truckName = data.trucks?.name || null;
      await supabase.from('activity_logs').insert({
        company_id: userProfile.company_id,
        user_id: user.id,
        action: 'added',
        details: {
          item_name: data.name,
          item_id: data.id,
          serial_number: data.serial_number,
          condition: data.condition,
          location: data.location_type === 'warehouse' ? 'Warehouse' : truckName
        }
      });

      const newInventoryItem: InventoryItem = {
        id: data.id,
        name: data.name,
        description: data.description,
        categoryId: data.category_id,
        barcode: data.barcode,
        quantity: 1,
        minQuantity: 0,
        price: data.unit_price,
        location: data.location,
        image_url: imageUrl || data.image_url,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        serialNumber: data.serial_number,
        condition: data.condition,
        locationType: data.location_type,
        assignedTruckId: data.assigned_truck_id,
        assignedTruckName: data.trucks?.name
      };
      
      setItems(prev => [newInventoryItem, ...prev]);
      setItemForm({
        name: '',
        description: '',
        categoryId: '',
        barcode: '',
        serialNumber: '',
        condition: 'good',
        locationType: 'warehouse',
        assignedTruckId: '',
        price: 0,
        image: null
      });
      setShowAddForm(false);
      
      toast({ title: "Success", description: "Tool added successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add tool",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const deleteItem = async (itemId: string, itemName: string) => {
    if (!confirm(`Are you sure you want to delete "${itemName}"?`)) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const item = items.find(i => i.id === itemId);
      
      // Log activity before deleting
      if (user && userProfile?.company_id && item) {
        await supabase.from('activity_logs').insert({
          company_id: userProfile.company_id,
          user_id: user.id,
          action: 'deleted',
          details: {
            item_name: itemName,
            item_id: itemId,
            serial_number: item.serialNumber,
            condition: item.condition,
            location: item.locationType === 'warehouse' ? 'Warehouse' : item.assignedTruckName
          }
        });
      }

      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      if (item && item.image_url) {
        await deleteItemImage(item.image_url);
      }
      
      setItems(prev => prev.filter(item => item.id !== itemId));
      toast({ title: "Success", description: "Tool deleted successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete tool", variant: "destructive" });
    }
  };

  const transferTool = async () => {
    if (!transferItem || !userProfile?.company_id) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Determine from and to locations
      const fromLocation = transferItem.locationType === 'warehouse' 
        ? 'Warehouse' 
        : transferItem.assignedTruckName || 'Unknown';
      const toTruck = trucks.find(t => t.id === transferTo.truckId);
      const toLocation = transferTo.type === 'warehouse' ? 'Warehouse' : toTruck?.name || 'Unknown';

      const updateData = {
        location_type: transferTo.type,
        assigned_truck_id: transferTo.type === 'truck' ? transferTo.truckId : null,
        assigned_at: new Date().toISOString(),
        assigned_by: user.id,
        location: transferTo.type === 'warehouse' ? 'Warehouse' : null
      };

      const { error } = await supabase
        .from('inventory_items')
        .update(updateData)
        .eq('id', transferItem.id);

      if (error) throw error;

      // Log transfer activity
      await supabase.from('activity_logs').insert({
        company_id: userProfile.company_id,
        user_id: user.id,
        action: 'transferred',
        details: {
          item_name: transferItem.name,
          item_id: transferItem.id,
          serial_number: transferItem.serialNumber,
          from: fromLocation,
          to: toLocation
        }
      });

      const truck = trucks.find(t => t.id === transferTo.truckId);
      setItems(prev => prev.map(item => 
        item.id === transferItem.id 
          ? { 
              ...item, 
              locationType: transferTo.type,
              assignedTruckId: transferTo.type === 'truck' ? transferTo.truckId : undefined,
              assignedTruckName: truck?.name,
              assignedAt: new Date()
            } 
          : item
      ));

      toast({ 
        title: "Success", 
        description: `Tool transferred to ${transferTo.type === 'warehouse' ? 'Warehouse' : truck?.name}` 
      });
      setTransferItem(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to transfer tool", variant: "destructive" });
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Unknown';
  };

  const getCategoryColor = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.color : '#6B7280';
  };

  const startEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      description: item.description || '',
      categoryId: item.categoryId,
      barcode: item.barcode || '',
      serialNumber: item.serialNumber || '',
      condition: item.condition || 'good',
      price: item.price,
      image: null
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
  };

  const updateItem = async () => {
    if (!editingItem) return;

    if (!editForm.name || !editForm.categoryId) {
      toast({ title: "Error", description: "Please fill in item name and category", variant: "destructive" });
      return;
    }

    const duplicate = await checkForDuplicate(
      editForm.serialNumber || null, 
      editForm.barcode || null, 
      editingItem.id
    );
    if (duplicate) {
      toast({
        title: "Error",
        description: `Item with this ${duplicate.field === 'serial_number' ? 'serial number' : 'barcode'} already exists`,
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const updateData = {
        name: editForm.name,
        description: editForm.description,
        category_id: editForm.categoryId,
        barcode: editForm.barcode || null,
        serial_number: editForm.serialNumber || null,
        condition: editForm.condition,
        unit_price: editForm.price
      };

      const { error } = await supabase
        .from('inventory_items')
        .update(updateData)
        .eq('id', editingItem.id);

      if (error) throw error;

      let imageUrl = editingItem.image_url;
      if (editForm.image) {
        const validation = validateImageFile(editForm.image);
        if (validation.valid) {
          if (editingItem.image_url) {
            await deleteItemImage(editingItem.image_url);
          }
          imageUrl = await uploadItemImage(editForm.image, editingItem.id);
          if (imageUrl) {
            await supabase
              .from('inventory_items')
              .update({ image_url: imageUrl })
              .eq('id', editingItem.id);
          }
        }
      }

      setItems(prev => prev.map(item => 
        item.id === editingItem.id 
          ? { 
              ...item, 
              name: editForm.name,
              description: editForm.description,
              categoryId: editForm.categoryId,
              barcode: editForm.barcode,
              serialNumber: editForm.serialNumber,
              condition: editForm.condition,
              price: editForm.price,
              image_url: imageUrl 
            } 
          : item
      ));

      toast({ title: "Success", description: "Tool updated successfully" });
      cancelEdit();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update tool", variant: "destructive" });
    }
    setLoading(false);
  };

  const getConditionBadge = (condition: string) => {
    const colors: Record<string, string> = {
      good: 'bg-green-100 text-green-800',
      fair: 'bg-yellow-100 text-yellow-800',
      poor: 'bg-orange-100 text-orange-800',
      damaged: 'bg-red-100 text-red-800'
    };
    return colors[condition] || colors.good;
  };

  const getLocationDisplay = (item: InventoryItem) => {
    if (item.locationType === 'warehouse') {
      return { icon: Warehouse, text: 'Warehouse', color: 'text-blue-600' };
    }
    return { icon: Truck, text: item.assignedTruckName || 'Unknown Truck', color: 'text-green-600' };
  };

  // Filter and sort items
  const filteredItems = items
    .filter(item => {
      const matchesSearch = 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.barcode?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesLocation = 
        filterLocation === 'all' || 
        item.locationType === filterLocation;
      
      const matchesTruck = 
        filterTruck === 'all' || 
        item.assignedTruckId === filterTruck ||
        (filterTruck === 'warehouse' && item.locationType === 'warehouse');
      
      const matchesCategory = 
        filterCategory === 'all' || 
        item.categoryId === filterCategory;

      return matchesSearch && matchesLocation && matchesTruck && matchesCategory;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'location':
          comparison = (a.locationType || '').localeCompare(b.locationType || '');
          break;
        case 'condition':
          comparison = (a.condition || '').localeCompare(b.condition || '');
          break;
        case 'category':
          comparison = getCategoryName(a.categoryId).localeCompare(getCategoryName(b.categoryId));
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {pageLoading ? (
        <Card className="text-center py-12">
          <CardContent>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading inventory...</p>
          </CardContent>
        </Card>
      ) : (
        <>
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6" />
          Tools Inventory
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowBulkImport(!showBulkImport)}
          >
            <Upload className="h-4 w-4 mr-2" />
            {showBulkImport ? 'Hide Import' : 'Bulk Import'}
          </Button>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Tool
          </Button>
        </div>
      </div>

      {/* Bulk Import Section */}
      {showBulkImport && (
        <BulkImport 
          categories={categories} 
          onImportComplete={() => {
            loadItems();
            setShowBulkImport(false);
          }} 
        />
      )}

      {/* Add Tool Form */}
      {showAddForm && (
        <Card className="border-green-500 border-2">
          <CardHeader className="bg-green-50 dark:bg-green-950">
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <Plus className="h-5 w-5" />
              Add New Tool
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="item-name">Tool Name *</Label>
                <Input
                  id="item-name"
                  value={itemForm.name}
                  onChange={(e) => setItemForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Cordless Drill"
                />
              </div>
              <div>
                <Label htmlFor="serial-number">Serial Number</Label>
                <Input
                  id="serial-number"
                  value={itemForm.serialNumber}
                  onChange={(e) => setItemForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                  placeholder="e.g., SN-12345"
                />
              </div>
              <div>
                <Label htmlFor="barcode">Barcode</Label>
                <Input
                  id="barcode"
                  value={itemForm.barcode}
                  onChange={(e) => setItemForm(prev => ({ ...prev, barcode: e.target.value }))}
                  placeholder="Scan or enter barcode"
                />
              </div>
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select value={itemForm.categoryId} onValueChange={(value) => setItemForm(prev => ({ ...prev, categoryId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="condition">Condition</Label>
                <Select value={itemForm.condition} onValueChange={(value: any) => setItemForm(prev => ({ ...prev, condition: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="price">Price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={itemForm.price}
                  onChange={(e) => setItemForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="location-type">Initial Location *</Label>
                <Select value={itemForm.locationType} onValueChange={(value: any) => setItemForm(prev => ({ ...prev, locationType: value, assignedTruckId: '' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="truck">Assign to Van</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {itemForm.locationType === 'truck' && (
                <div>
                  <Label htmlFor="truck">Select Van *</Label>
                  <Select value={itemForm.assignedTruckId} onValueChange={(value) => setItemForm(prev => ({ ...prev, assignedTruckId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select van" />
                    </SelectTrigger>
                    <SelectContent>
                      {trucks.map((truck) => (
                        <SelectItem key={truck.id} value={truck.id}>
                          {truck.name} ({truck.identifier})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="md:col-span-2 lg:col-span-1">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={itemForm.description}
                  onChange={(e) => setItemForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <Label htmlFor="image">Tool Image (Optional)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setItemForm(prev => ({ ...prev, image: file }));
                      }
                    }}
                    className="flex-1"
                  />
                  {itemForm.image && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{itemForm.image.name}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setItemForm(prev => ({ ...prev, image: null }))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={addItem} disabled={loading} className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                Add Tool
              </Button>
              <Button onClick={() => setShowAddForm(false)} variant="outline">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      {editingItem && (
        <Dialog open={!!editingItem} onOpenChange={() => cancelEdit()}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Edit Tool: {editingItem.name}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div>
                <Label htmlFor="edit-item-name">Tool Name</Label>
                <Input
                  id="edit-item-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-serial">Serial Number</Label>
                <Input
                  id="edit-serial"
                  value={editForm.serialNumber}
                  onChange={(e) => setEditForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-barcode">Barcode</Label>
                <Input
                  id="edit-barcode"
                  value={editForm.barcode}
                  onChange={(e) => setEditForm(prev => ({ ...prev, barcode: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Select value={editForm.categoryId} onValueChange={(value) => setEditForm(prev => ({ ...prev, categoryId: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-condition">Condition</Label>
                <Select value={editForm.condition} onValueChange={(value: any) => setEditForm(prev => ({ ...prev, condition: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-price">Price ($)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  value={editForm.price}
                  onChange={(e) => setEditForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="edit-image">Tool Image</Label>
                <Input
                  id="edit-image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setEditForm(prev => ({ ...prev, image: file }));
                  }}
                />
                {editingItem.image_url && !editForm.image && (
                  <p className="text-sm text-gray-500 mt-1">Current image will be kept</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={cancelEdit} variant="outline">Cancel</Button>
              <Button onClick={updateItem} disabled={loading}>Update Tool</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Transfer Dialog */}
      {transferItem && (
        <Dialog open={!!transferItem} onOpenChange={() => setTransferItem(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Transfer Tool
              </DialogTitle>
              <DialogDescription>
                Move "{transferItem.name}" to a new location
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Current Location:</p>
                <p className="font-medium">
                  {transferItem.locationType === 'warehouse' ? 'Warehouse' : transferItem.assignedTruckName}
                </p>
              </div>
              <div>
                <Label>Transfer To</Label>
                <Select 
                  value={transferTo.type === 'warehouse' ? 'warehouse' : transferTo.truckId} 
                  onValueChange={(value) => {
                    if (value === 'warehouse') {
                      setTransferTo({ type: 'warehouse' });
                    } else {
                      setTransferTo({ type: 'truck', truckId: value });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">
                      <div className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4" />
                        Warehouse
                      </div>
                    </SelectItem>
                    {trucks.map((truck) => (
                      <SelectItem key={truck.id} value={truck.id} disabled={truck.id === transferItem.assignedTruckId}>
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          {truck.name} ({truck.identifier})
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setTransferItem(null)} variant="outline">Cancel</Button>
              <Button onClick={transferTool}>Confirm Transfer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name, serial number, or barcode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterLocation} onValueChange={(value: any) => setFilterLocation(value)}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="truck">On Vans</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTruck} onValueChange={setFilterTruck}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by Van" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vans</SelectItem>
                <SelectItem value="warehouse">Warehouse Only</SelectItem>
                {trucks.map((truck) => (
                  <SelectItem key={truck.id} value={truck.id}>
                    {truck.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tools List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Tools ({filteredItems.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-800">
                  <TableHead className="w-12"></TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Name <SortIcon field="name" />
                    </div>
                  </TableHead>
                  <TableHead>Serial #</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSort('category')}
                  >
                    <div className="flex items-center gap-1">
                      Category <SortIcon field="category" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSort('condition')}
                  >
                    <div className="flex items-center gap-1">
                      Condition <SortIcon field="condition" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleSort('location')}
                  >
                    <div className="flex items-center gap-1">
                      Location <SortIcon field="location" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No tools found. Add your first tool above.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const location = getLocationDisplay(item);
                    const LocationIcon = location.icon;
                    return (
                      <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell>
                          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Image className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.barcode && <p className="text-xs text-gray-500">BC: {item.barcode}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.serialNumber || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            style={{ backgroundColor: getCategoryColor(item.categoryId) }}
                            className="text-white"
                          >
                            {getCategoryName(item.categoryId)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getConditionBadge(item.condition || 'good')}>
                            {(item.condition || 'good').charAt(0).toUpperCase() + (item.condition || 'good').slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1 ${location.color}`}>
                            <LocationIcon className="h-4 w-4" />
                            <span className="text-sm">{location.text}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setTransferItem(item)}>
                                <ArrowRightLeft className="h-4 w-4 mr-2" />
                                Transfer
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => startEdit(item)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => deleteItem(item.id, item.name)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
};