import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Scan, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';

export const BarcodeInput: React.FC = () => {
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const { isAdmin, isTech } = useAuth();

  const canModifyInventory = isAdmin || isTech;

  const handleSubmit = async () => {
    if (!canModifyInventory) {
      toast({
        title: "Permission Denied",
        description: "Only admins and techs can modify inventory",
        variant: "destructive"
      });
      return;
    }

    if (!barcode || !name) {
      toast({
        title: "Error",
        description: "Barcode and name are required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert([{
          barcode,
          name,
          description,
          category_id: category || null,
          quantity,
          price,
          location: '',
          min_quantity: 0
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: `${name} added to inventory`
      });

      // Reset form
      setBarcode('');
      setName('');
      setDescription('');
      setCategory('');
      setQuantity(1);
      setPrice(0);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add item",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  if (!canModifyInventory) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6">
          <p className="text-center text-gray-500">
            You don't have permission to add inventory items.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          Add Item Manually
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="barcode">Barcode</Label>
          <Input
            id="barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Enter barcode"
          />
        </div>
        
        <div>
          <Label htmlFor="name">Product Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter product name"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter description (optional)"
          />
        </div>

        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min="1"
          />
        </div>

        <div>
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            min="0"
          />
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          {loading ? 'Adding...' : 'Add to Inventory'}
        </Button>
      </CardContent>
    </Card>
  );
};