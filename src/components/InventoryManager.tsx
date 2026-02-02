import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { InventoryItem, Category } from '@/types/inventory';
import { useInventory } from '@/contexts/InventoryContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Package, Plus, Trash2, AlertTriangle, Upload, Image, X, Edit } from 'lucide-react';
import { BulkImport } from './BulkImport';
import { uploadItemImage, deleteItemImage, validateImageFile } from '@/lib/imageUtils';

export const InventoryManager: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const { categories, loading: categoriesLoading } = useInventory();
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    barcode: '',
    quantity: 0,
    minQuantity: 0,
    price: 0,
    location: '',
    image: null as File | null
  });
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    barcode: '',
    quantity: 0,
    minQuantity: 0,
    price: 0,
    location: '',
    image: null as File | null
  });
  const { toast } = useToast();

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
// ----------

  const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's company information
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profileData?.company_id) return;

      const companyId = profileData.company_id;
// ----------





      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
         .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform the data to match our InventoryItem interface
      const transformedItems = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        categoryId: item.category_id, // Map category_id to categoryId
        barcode: item.barcode,
        quantity: item.quantity,
        minQuantity: item.min_quantity,
        price: item.unit_price,
        location: item.location,
        image_url: item.image_url,
        userId: item.user_id,
        createdAt: new Date(item.created_at),
        updatedAt: new Date(item.updated_at)
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

  const checkForDuplicate = async (name: string, barcode: string | null) => {
    // Get current user's company ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return true;

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profileData?.company_id) return true;

    // Check for duplicate name
    const { data: nameCheck } = await supabase
      .from('inventory_items')
      .select('name')
      .eq('company_id', profileData.company_id)
      .ilike('name', name)
      .single();

    // Check for duplicate barcode only if barcode is provided
    let barcodeCheck = null;
    if (barcode) {
      const { data: barcodeData } = await supabase
        .from('inventory_items')
        .select('barcode')
        .eq('company_id', profileData.company_id)
        .eq('barcode', barcode)
        .single();
      barcodeCheck = barcodeData;
    }

    return nameCheck !== null || barcodeCheck !== null;
  };

  const sendLowStockAlert = async (itemName: string, quantity: number, minQuantity: number) => {
    try {
      console.log(`Sending low stock alert for ${itemName}: ${quantity} remaining (min: ${minQuantity})`);
      
      const { data, error } = await supabase.functions.invoke('email-notifications', {
        body: {
          type: 'low_stock',
          to: 'indytradingpost@comcast.net',
          subject: `Low Stock Alert - ${itemName}`,
          message: `Item "${itemName}" is running low with only ${quantity} units remaining. Minimum required: ${minQuantity}.`,
          companyName: 'Inventory Management System'
        }
      });
      
      if (error) {
        console.error('Low stock alert error:', error);
      } else {
        console.log('Low stock alert sent successfully:', data);
      }
    } catch (error) {
      console.error('Failed to send low stock alert:', error);
    }
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

    // Handle empty barcode as null to avoid unique constraint issues
    const barcode = itemForm.barcode.trim() || null;

    const isDuplicate = await checkForDuplicate(itemForm.name, barcode);
    if (isDuplicate) {
      toast({
        title: "Error",
        description: "Item with this name or barcode already exists in your company",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      // Get current user's company ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "User not authenticated",
          variant: "destructive"
        });
        return;
      }

      // Get user's company information
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profileData?.company_id) {
        toast({
          title: "Error",
          description: "Failed to get company information",
          variant: "destructive"
        });
        return;
      }

      const itemData = {
        name: itemForm.name.trim(),
        description: itemForm.description,
        category_id: itemForm.categoryId,
        barcode: itemForm.barcode.trim() || null,
        quantity: itemForm.quantity,
        min_quantity: itemForm.minQuantity,
        unit_price: itemForm.price,
        location: itemForm.location,
        company_id: profileData.company_id
      };

      const { data, error } = await supabase
        .from('inventory_items')
        .insert([itemData])
        .select()
        .single();

      if (error) throw error;

      // Upload image if provided
      let imageUrl = null;
      if (itemForm.image) {
        const validation = validateImageFile(itemForm.image);
        if (!validation.valid) {
          toast({
            title: "Error",
            description: validation.error,
            variant: "destructive"
          });
          return;
        }

        imageUrl = await uploadItemImage(itemForm.image, data.id);
        if (imageUrl) {
          // Update item with image URL
          await supabase
            .from('inventory_items')
            .update({ image_url: imageUrl })
            .eq('id', data.id);
        }
      }
      
      // Transform the new item data to match our interface
      const newInventoryItem: InventoryItem = {
        id: data.id,
        name: data.name,
        description: data.description,
        categoryId: data.category_id,
        barcode: data.barcode,
        quantity: data.quantity,
        minQuantity: data.min_quantity,
        price: data.unit_price,
        location: data.location,
        image_url: imageUrl,
        userId: data.user_id,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
      
      setItems(prev => [newInventoryItem, ...prev]);
      setItemForm({
        name: '',
        description: '',
        categoryId: '',
        barcode: '',
        quantity: 0,
        minQuantity: 0,
        price: 0,
        location: '',
        image: null
      });
      
      toast({
        title: "Success",
        description: "Item added successfully"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add item",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const deleteItem = async (itemId: string, itemName: string) => {
    if (!confirm(`Are you sure you want to delete "${itemName}"?`)) return;
    
    try {
      // Find the item to get its image URL
      const item = items.find(i => i.id === itemId);
      
      // Delete the item from database
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Delete the image from storage if it exists
      if (item && 'image_url' in item && item.image_url) {
        await deleteItemImage(item.image_url);
      }
      
      setItems(prev => prev.filter(item => item.id !== itemId));
      toast({
        title: "Success",
        description: "Item deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive"
      });
    }
  };

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .update({ quantity: newQuantity })
        .eq('id', itemId);

      if (error) throw error;
      
      
      const item = items.find(i => i.id === itemId);
      if (item && newQuantity <= (item.minQuantity || 0) && newQuantity > 0) {
        sendLowStockAlert(item.name, newQuantity, item.minQuantity || 0);
      }
      
      setItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      ));
      
      toast({
        title: "Success",
        description: "Quantity updated"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update quantity",
        variant: "destructive"
      });
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
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      price: item.price,
      location: item.location || '',
      image: null
    });
    
    // Scroll to the edit form after a short delay to ensure it's rendered
    setTimeout(() => {
      const editForm = document.getElementById('edit-form');
      if (editForm) {
        editForm.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 100);
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditForm({
      name: '',
      description: '',
      categoryId: '',
      barcode: '',
      quantity: 0,
      minQuantity: 0,
      price: 0,
      location: '',
      image: null
    });
  };

  const updateItem = async () => {
    if (!editingItem) return;

    if (!editForm.name || !editForm.categoryId) {
      toast({
        title: "Error",
        description: "Please fill in item name and category",
        variant: "destructive"
      });
      return;
    }

    // Check for duplicates (excluding current item)
    const isDuplicate = items.some(item => 
      item.id !== editingItem.id && (
        item.name.toLowerCase() === editForm.name.toLowerCase() || 
        (editForm.barcode && item.barcode === editForm.barcode)
      )
    );

    if (isDuplicate) {
      toast({
        title: "Error",
        description: "Item with this name or barcode already exists",
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
        barcode: editForm.barcode,
        quantity: editForm.quantity,
        min_quantity: editForm.minQuantity,
        unit_price: editForm.price,
        location: editForm.location
      };

      // Update basic item data
      const { error } = await supabase
        .from('inventory_items')
        .update(updateData)
        .eq('id', editingItem.id);

      if (error) throw error;

      // Handle image upload if new image is provided
      let imageUrl = editingItem.image_url;
      if (editForm.image) {
        const validation = validateImageFile(editForm.image);
        if (!validation.valid) {
          toast({
            title: "Error",
            description: validation.error,
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        // Delete old image if it exists
        if (editingItem.image_url) {
          await deleteItemImage(editingItem.image_url);
        }

        // Upload new image
        imageUrl = await uploadItemImage(editForm.image, editingItem.id);
        if (imageUrl) {
          await supabase
            .from('inventory_items')
            .update({ image_url: imageUrl })
            .eq('id', editingItem.id);
        }
      }

      // Update local state with properly transformed data
      setItems(prev => prev.map(item => 
        item.id === editingItem.id 
          ? { 
              ...item, 
              name: updateData.name,
              description: updateData.description,
              categoryId: editForm.categoryId,
              barcode: updateData.barcode,
              quantity: updateData.quantity,
              minQuantity: updateData.min_quantity,
              price: updateData.unit_price,
              location: updateData.location,
              image_url: imageUrl 
            } 
          : item
      ));

      toast({
        title: "Success",
        description: "Item updated successfully"
      });

      cancelEdit();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update item",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const [showBulkImport, setShowBulkImport] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => setShowBulkImport(!showBulkImport)}
          className="mb-4"
        >
          <Upload className="h-4 w-4 mr-2" />
          {showBulkImport ? 'Hide Bulk Import' : 'Show Bulk Import'}
        </Button>
      </div>

      {showBulkImport && (
        <BulkImport 
          categories={categories} 
          onImportComplete={() => {
            loadItems();
            setShowBulkImport(false);
          }} 
        />
      )}

      {editingItem && (
        <Card id="edit-form" className="border-blue-500 border-2 shadow-lg">
          <CardHeader className="bg-blue-50">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Edit className="h-5 w-5" />
              Edit Item: {editingItem.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-item-name">Item Name</Label>
                <Input
                  id="edit-item-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter item name"
                />
              </div>
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Select value={editForm.categoryId} onValueChange={(value) => setEditForm(prev => ({ ...prev, categoryId: value }))}>
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
                <Label htmlFor="edit-barcode">Barcode</Label>
                <Input
                  id="edit-barcode"
                  value={editForm.barcode}
                  onChange={(e) => setEditForm(prev => ({ ...prev, barcode: e.target.value }))}
                  placeholder="Enter barcode"
                />
              </div>
              <div>
                <Label htmlFor="edit-quantity">Quantity</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-min-quantity">Min Quantity</Label>
                <Input
                  id="edit-min-quantity"
                  type="number"
                  value={editForm.minQuantity}
                  onChange={(e) => setEditForm(prev => ({ ...prev, minQuantity: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-price">Price</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  value={editForm.price}
                  onChange={(e) => setEditForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  value={editForm.location}
                  onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g., Shelf A, Van 1"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter description"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="edit-image">Item Image (Optional)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="edit-image"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setEditForm(prev => ({ ...prev, image: file }));
                      }
                    }}
                    className="flex-1"
                  />
                  {editForm.image && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{editForm.image.name}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditForm(prev => ({ ...prev, image: null }))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {editingItem.image_url && !editForm.image && (
                  <p className="text-sm text-gray-500 mt-1">
                    Current image: {editingItem.image_url.split('/').pop()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={updateItem} disabled={loading} className="flex-1">
                <Edit className="h-4 w-4 mr-2" />
                Update Item
              </Button>
              <Button onClick={cancelEdit} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Add New Item
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="item-name">Item Name</Label>
              <Input
                id="item-name"
                value={itemForm.name}
                onChange={(e) => setItemForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter item name"
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
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
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={itemForm.barcode}
                onChange={(e) => setItemForm(prev => ({ ...prev, barcode: e.target.value }))}
                placeholder="Enter barcode"
              />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                value={itemForm.quantity}
                onChange={(e) => setItemForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <Label htmlFor="min-quantity">Min Quantity</Label>
              <Input
                id="min-quantity"
                type="number"
                value={itemForm.minQuantity}
                onChange={(e) => setItemForm(prev => ({ ...prev, minQuantity: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={itemForm.price}
                onChange={(e) => setItemForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={itemForm.location}
                onChange={(e) => setItemForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Shelf A, Van 1"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="image">Item Image (Optional)</Label>
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
          <Button onClick={addItem} disabled={loading} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {item.quantity <= item.minQuantity && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                  {item.name}
                </span>
                <Badge 
                  style={{ backgroundColor: getCategoryColor(item.categoryId) }}
                  className="text-white"
                >
                  {getCategoryName(item.categoryId)}
                </Badge>
              </CardTitle>
              <div className="mt-2 h-32 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                {'image_url' in item && item.image_url ? (
                  <img 
                    src={item.image_url} 
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <Image className="h-8 w-8 mb-1" />
                    <span className="text-xs">No Image</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Quantity:</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateQuantity(item.id, Math.max(0, item.quantity - 1))}
                  >
                    -
                  </Button>
                  <span className="font-medium">{item.quantity}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
              {item.location && (
                <p className="text-sm text-muted-foreground">
                  Location: {item.location}
                </p>
              )}
              <div className="flex justify-between items-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(item)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteItem(item.id, item.name)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};