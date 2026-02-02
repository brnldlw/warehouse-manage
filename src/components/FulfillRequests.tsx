import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Package, CheckCircle, Clock, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface StockRequest {
  id: string;
  user_id: string;
  job_number: string;
  notes: string;
  items: Array<{
    item_id: string;
    item_name: string;
    quantity_requested: number;
    quantity_fulfilled?: number;
  }>;
  status: string;
  created_at: string;
  user_email?: string;
}

export const FulfillRequests: React.FC = () => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {

// -----
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
// ---





      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .eq('status', 'pending')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Just use the raw data for now
      const formattedData = data || [];
      
      setRequests(formattedData);
    } catch (error) {
      console.error('Error fetching requests:', error);
      toast({
        title: 'Error fetching requests',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const updateFulfillQuantity = (requestId: string, itemId: string, change: number) => {
    setRequests(prev => prev.map(request => {
      if (request.id === requestId) {
        const updatedItems = request.items.map(item => {
          if (item.item_id === itemId) {
            const currentFulfilled = item.quantity_fulfilled || 0;
            const newFulfilled = Math.max(0, Math.min(item.quantity_requested, currentFulfilled + change));
            return { ...item, quantity_fulfilled: newFulfilled };
          }
          return item;
        });
        return { ...request, items: updatedItems };
      }
      return request;
    }));
  };

  const fulfillAllItems = (requestId: string) => {
    setRequests(prev => prev.map(request => {
      if (request.id === requestId) {
        const updatedItems = request.items.map(item => ({
          ...item,
          quantity_fulfilled: item.quantity_requested
        }));
        return { ...request, items: updatedItems };
      }
      return request;
    }));
  };

  const submitFulfillment = async (requestId: string) => {
    setLoading(true);
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) return;

      const { error } = await supabase
        .from('stock_requests')
        .update({
          status: 'fulfilled',
          items: request.items,
          fulfilled_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      // Get company information for notifications
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      const companyId = profileData?.company_id;

      // Track low stock items
      const lowStockItems: Array<{name: string; quantity: number; min_quantity: number}> = [];

      // Update inventory quantities
      for (const item of request.items) {
        if (item.quantity_fulfilled && item.quantity_fulfilled > 0) {
          const { error: inventoryError } = await supabase
            .rpc('decrement_inventory', {
              item_id: item.item_id,
              decrement_amount: item.quantity_fulfilled
            });
          
          if (inventoryError) {
            console.error('Error updating inventory:', inventoryError);
          } else {
            // Check for existing active technician inventory record
            const { data: existingRecord, error: findError } = await supabase
              .from('technician_inventory')
              .select('id, quantity, remaining_quantity, notes')
              .eq('user_id', request.user_id)
              .eq('item_id', item.item_id)
              .eq('company_id', companyId)
              .eq('status', 'active')
              .maybeSingle(); // Use maybeSingle to avoid error if no record found

            if (findError) {
              console.error('Error checking existing inventory:', findError);
              continue; // Skip this item if we can't check for existing records
            }

            let techInventoryError = null;

            if (existingRecord) {
              // Update existing record - add to quantities
              const newTotalQuantity = existingRecord.quantity + item.quantity_fulfilled;
              const newRemainingQuantity = existingRecord.remaining_quantity + item.quantity_fulfilled;
              const timestamp = new Date().toLocaleString();
              const newNote = `Added ${item.quantity_fulfilled} from job #${request.job_number} on ${timestamp}`;
              const updatedNotes = existingRecord.notes ? `${existingRecord.notes}\n${newNote}` : newNote;

              const { error: updateError } = await supabase
                .from('technician_inventory')
                .update({
                  quantity: newTotalQuantity,
                  remaining_quantity: newRemainingQuantity,
                  notes: updatedNotes,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingRecord.id);

              techInventoryError = updateError;
              if (!updateError) {
                console.log(`Updated existing inventory: ${item.item_name} total now ${newTotalQuantity} (added ${item.quantity_fulfilled})`);
              }
            } else {
              // Create new record
              const { error: insertError } = await supabase
                .from('technician_inventory')
                .insert({
                  user_id: request.user_id,
                  item_id: item.item_id,
                  item_name: item.item_name,
                  quantity: item.quantity_fulfilled,
                  remaining_quantity: item.quantity_fulfilled,
                  job_number: request.job_number,
                  request_id: requestId,
                  company_id: companyId,
                  status: 'active',
                  notes: `Fulfilled from stock request #${request.job_number}`
                });

              techInventoryError = insertError;
              if (!insertError) {
                console.log(`Created new inventory record: ${item.quantity_fulfilled} ${item.item_name}`);
              }
            }

            if (techInventoryError) {
              console.error('Error managing technician inventory:', techInventoryError);
            }

            // Check if item is now below minimum quantity
            const { data: itemData, error: fetchError } = await supabase
              .from('inventory_items')
              .select('name, quantity, min_quantity')
              .eq('id', item.item_id)
              .single();

            if (!fetchError && itemData && itemData.min_quantity) {
              if (itemData.quantity < itemData.min_quantity) {
                lowStockItems.push({
                  name: itemData.name,
                  quantity: itemData.quantity,
                  min_quantity: itemData.min_quantity
                });
              }
            }
          }
        }
      }

      // Send low stock notification if any items are below minimum
      if (lowStockItems.length > 0 && companyId) {
        try {
          const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('name, settings')
            .eq('id', companyId)
            .single();

          if (!companyError && company) {
            const settings = company.settings || {};
            const emailConfig = settings.emailNotifications || {};
            const adminEmail = emailConfig.adminEmail;
            const companyName = emailConfig.companyName || company.name || 'Inventory Management System';

            if (adminEmail) {
              console.log('Sending low stock notification to:', adminEmail);
              
              const response = await supabase.functions.invoke('email-notifications', {
                body: {
                  type: 'low_stock',
                  to: adminEmail,
                  subject: `Low Stock Alert - ${lowStockItems.length} Item(s)`,
                  items: lowStockItems,
                  companyName,
                  companyId
                }
              });

              if (response.error) {
                console.error('Low stock email notification error:', response.error);
              } else {
                console.log('Low stock notification sent successfully');
              }
            } else {
              console.log('No admin email configured for low stock alerts');
            }
          }
        } catch (emailError) {
          console.error('Failed to send low stock notification:', emailError);
          // Don't fail the fulfillment if email fails
        }
      }

      toast({
        title: 'Success',
        description: 'Request fulfilled successfully',
      });

      await fetchPendingRequests();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fulfill request',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Fulfill Stock Requests</h2>
        <Badge variant="secondary">{requests.length} pending</Badge>
      </div>

      {requests.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No pending requests to fulfill</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Job #{request.job_number}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4" />
                    User ID: {request.user_id}
                  </div>
                </CardTitle>
                {request.notes && (
                  <p className="text-sm text-gray-600">{request.notes}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {request.items.map((item) => {
                    const fulfilled = item.quantity_fulfilled || 0;
                    return (
                      <div key={item.item_id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex-1">
                          <span className="font-medium">{item.item_name}</span>
                          <div className="text-sm text-gray-600">
                            Requested: {item.quantity_requested} | Fulfilled: {fulfilled}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateFulfillQuantity(request.id, item.item_id, -1)}
                            disabled={fulfilled === 0}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center font-semibold">{fulfilled}</span>
                          <Button
                            size="sm"
                            onClick={() => updateFulfillQuantity(request.id, item.item_id, 1)}
                            disabled={fulfilled >= item.quantity_requested}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fulfillAllItems(request.id)}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Fulfill All
                  </Button>
                  <Button
                    onClick={() => submitFulfillment(request.id)}
                    disabled={loading || !request.items.some(item => (item.quantity_fulfilled || 0) > 0)}
                  >
                    Complete Fulfillment
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};