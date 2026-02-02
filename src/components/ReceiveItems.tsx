import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Package, CheckCircle, Clock, FileSignature } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface FulfilledRequest {
  id: string;
  job_number: string;
  notes: string;
  items: Array<{
    item_id: string;
    item_name: string;
    quantity_fulfilled: number;
    received?: boolean;
  }>;
  status: string;
  fulfilled_at: string;
}

export const ReceiveItems: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<FulfilledRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFulfilledRequests();
  }, [user]);

  const fetchFulfilledRequests = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'fulfilled')
        .order('fulfilled_at', { ascending: false });
      
      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching fulfilled requests:', error);
    }
  };

  const toggleItemReceived = (requestId: string, itemId: string) => {
    setRequests(prev => prev.map(request => {
      if (request.id === requestId) {
        const updatedItems = request.items.map(item => {
          if (item.item_id === itemId) {
            return { ...item, received: !item.received };
          }
          return item;
        });
        return { ...request, items: updatedItems };
      }
      return request;
    }));
  };

  const confirmReceipt = async (requestId: string) => {
    setLoading(true);
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) return;

      const receivedItems = request.items.filter(item => item.received);
      if (receivedItems.length === 0) {
        toast({
          title: 'Error',
          description: 'Please check off at least one item as received',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('stock_requests')
        .update({
          status: 'received',
          items: request.items,
          received_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Items marked as received successfully',
      });

      await fetchFulfilledRequests();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to confirm receipt',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Receive Items</h2>
        <Badge variant="secondary">{requests.length} to receive</Badge>
      </div>

      {requests.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No fulfilled requests to receive</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const receivedCount = request.items.filter(item => item.received).length;
            const totalCount = request.items.length;
            
            return (
              <Card key={request.id} className="bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Job #{request.job_number}
                    </div>
                    <Badge variant={receivedCount === totalCount ? "default" : "secondary"}>
                      {receivedCount}/{totalCount} checked
                    </Badge>
                  </CardTitle>
                  {request.notes && (
                    <p className="text-sm text-gray-600">{request.notes}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {request.items.map((item) => (
                      <div key={item.item_id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
                        <Checkbox
                          id={`${request.id}-${item.item_id}`}
                          checked={item.received || false}
                          onCheckedChange={() => toggleItemReceived(request.id, item.item_id)}
                        />
                        <label
                          htmlFor={`${request.id}-${item.item_id}`}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${item.received ? 'line-through text-gray-500' : ''}`}>
                              {item.item_name}
                            </span>
                            <Badge variant="outline">
                              {item.quantity_fulfilled} items
                            </Badge>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => confirmReceipt(request.id)}
                      disabled={loading || receivedCount === 0}
                      className="flex items-center gap-2"
                    >
                      <FileSignature className="h-4 w-4" />
                      Sign Off on Receipt
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};