import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Minus, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
}

interface RequestItem {
  itemId: string;
  itemName: string;
  quantity: number;
}

export const CreateRequest: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [jobNumber, setJobNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [requestItems, setRequestItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInventoryItems();
  }, []);

  const fetchInventoryItems = async () => {
    try {
      // Get user's company ID first
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user?.id)
        .single();

      if (!profileData?.company_id) {
        console.error('No company ID found for user');
        return;
      }

      // Fetch only items for user's company
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, quantity')
        .eq('company_id', profileData.company_id)
        .order('name');
      
      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const addRequestItem = () => {
    setRequestItems(prev => [...prev, { itemId: '', itemName: '', quantity: 1 }]);
  };

  const updateRequestItem = (index: number, field: string, value: any) => {
    setRequestItems(prev => prev.map((item, i) => {
      if (i === index) {
        if (field === 'itemId') {
          const selectedItem = items.find(inv => inv.id === value);
          return { ...item, itemId: value, itemName: selectedItem?.name || '' };
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const removeRequestItem = (index: number) => {
    setRequestItems(prev => prev.filter((_, i) => i !== index));
  };

  const submitRequest = async () => {
    if (!jobNumber || requestItems.length === 0) {
      toast({
        title: 'Error',
        description: 'Please provide job number and at least one item',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Get user's company ID
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user?.id)
        .single();

      if (!profileData?.company_id) {
        throw new Error('Company ID not found');
      }

      const requestData = {
        user_id: user?.id,
        company_id: profileData.company_id,
        job_number: jobNumber,
        notes,
        items: requestItems.map(item => ({
          item_id: item.itemId,
          item_name: item.itemName,
          quantity_requested: item.quantity
        })),
        status: 'pending'
      };

      const { error } = await supabase
        .from('stock_requests')
        .insert([requestData]);

      if (error) throw error;

      // Send email notification to company admin
      try {
        // Get company settings including admin email
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('name, settings')
          .eq('id', profileData.company_id)
          .single();

        if (companyError) {
          console.error('Error fetching company:', companyError);
        } else if (company) {
          const settings = company.settings || {};
          const emailConfig = settings.emailNotifications || {};
          const adminEmail = emailConfig.adminEmail;
          const companyName = emailConfig.companyName || company.name || 'Inventory Management System';

          // Check if admin email is configured
          if (adminEmail) {
            try {
              console.log('Sending stock request notification to:', adminEmail);
              console.log('Company name:', companyName);
              console.log('Email config:', emailConfig);
              
              const response = await supabase.functions.invoke('email-notifications', {
                body: {
                  type: 'stock_request',
                  to: adminEmail,
                  subject: `New Stock Request - Job #${jobNumber}`,
                  requestData: {
                    userName: user?.email || 'Unknown User',
                    jobNumber,
                    items: requestItems,
                    notes,
                    date: new Date().toLocaleString()
                  },
                  companyName,
                  companyId: profileData.company_id
                }
              });
              
              console.log('Email notification response:', response);
              
              if (response.error) {
                console.error('Email notification error:', response.error);
              } else {
                console.log(`Stock request notification sent successfully to ${adminEmail}`);
              }
            } catch (emailError) {
              console.error(`Failed to send email to ${adminEmail}:`, emailError);
            }
          } else {
            console.log('No admin email configured in company settings');
            console.log('Company settings:', settings);
          }
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the request if email fails
      }

      toast({
        title: 'Success',
        description: 'Stock request submitted successfully',
      });

      // Reset form
      setJobNumber('');
      setNotes('');
      setRequestItems([]);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit request',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Create Stock Request
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="job-number">Job Number</Label>
          <Input
            id="job-number"
            value={jobNumber}
            onChange={(e) => setJobNumber(e.target.value)}
            placeholder="Enter job number"
          />
        </div>

        <div>
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes..."
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Requested Items</Label>
            <Button size="sm" onClick={addRequestItem}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </div>

          {requestItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2 p-3 border rounded">
              <Select
                value={item.itemId}
                onValueChange={(value) => updateRequestItem(index, 'itemId', value)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((invItem) => (
                    <SelectItem key={invItem.id} value={invItem.id}>
                      {invItem.name} (Available: {invItem.quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updateRequestItem(index, 'quantity', parseInt(e.target.value) || 1)}
                className="w-20"
              />
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => removeRequestItem(index)}
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button onClick={submitRequest} disabled={loading} className="w-full">
          Submit Request
        </Button>
      </CardContent>
    </Card>
  );
};