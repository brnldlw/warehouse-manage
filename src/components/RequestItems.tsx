import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Package, FileText, CheckCircle, ShoppingCart, AlertCircle, Image } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface Category {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  category: string;
  category_id?: string;
  image_url?: string;
}

interface RequestItem {
  item_id: string;
  item_name: string;
  quantity_requested: number;
}

export const RequestItems: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [requestItems, setRequestItems] = useState<RequestItem[]>([]);
  const [jobNumber, setJobNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [fetchingItems, setFetchingItems] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      setFetchingItems(true);
      
      // Fetch inventory items
      // -------------------------
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
      // -------------------------
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('id, name, quantity, category_id, image_url')
        .eq('company_id', companyId)
        .order('name');
      
      if (inventoryError) {
        console.error('Supabase inventory error:', inventoryError);
        throw inventoryError;
      }

      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name');
      
      if (categoriesError) {
        console.error('Supabase categories error:', categoriesError);
        throw categoriesError;
      }
      
      // Create category map
      const categoryMap = (categoriesData || []).reduce((acc, cat) => {
        acc[cat.id] = cat;
        return acc;
      }, {} as Record<string, Category>);
      
      console.log('Fetched items:', inventoryData);
      const transformedItems = (inventoryData || []).map(item => ({
        ...item,
        category: categoryMap[item.category_id]?.name || 'Uncategorized'
      }));
      setItems(transformedItems);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast({
        title: 'Error',
        description: 'Failed to load inventory items',
        variant: 'destructive',
      });
    } finally {
      setFetchingItems(false);
    }
  };

  const updateRequestQuantity = (itemId: string, itemName: string, change: number) => {
    setRequestItems(prev => {
      const existing = prev.find(r => r.item_id === itemId);
      if (existing) {
        const newQuantity = Math.max(0, existing.quantity_requested + change);
        if (newQuantity === 0) {
          return prev.filter(r => r.item_id !== itemId);
        }
        return prev.map(r => 
          r.item_id === itemId 
            ? { ...r, quantity_requested: newQuantity }
            : r
        );
      } else if (change > 0) {
        return [...prev, { item_id: itemId, item_name: itemName, quantity_requested: change }];
      }
      return prev;
    });
  };

  const submitRequest = async () => {
    if (!jobNumber.trim() || requestItems.length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter a job number and select items',
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

      const { error } = await supabase
        .from('stock_requests')
        .insert({
          user_id: user?.id,
          company_id: profileData.company_id,
          job_number: jobNumber,
          notes: notes,
          items: requestItems,
          status: 'pending',
          created_at: new Date().toISOString()
        });

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
                  subject: `New Stock Request `,
                  requestData: {
                    userName: user?.email || 'Unknown User',
                    jobNumber,
                    items: requestItems.map(item => ({
                      itemName: item.item_name,
                      quantity: item.quantity_requested
                    })),
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

      setJobNumber('');
      setNotes('');
      setRequestItems([]);
      setShowReview(false);
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

  if (showReview) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-600">
            <CheckCircle className="h-6 w-6" />
            Review Stock Request
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Job Number</Label>
              <p className="text-lg font-bold text-blue-600">{jobNumber}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Notes</Label>
              <p className="text-sm text-gray-600">{notes || 'No notes provided'}</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Requested Items ({requestItems.length})</Label>
            <div className="space-y-3">
              {requestItems.map((item) => (
                <div key={item.item_id} className="flex justify-between items-center p-4 bg-blue-50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">{item.item_name}</span>
                  </div>
                  <Badge className="bg-blue-600 text-white text-lg px-3 py-1">
                    {item.quantity_requested}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={() => setShowReview(false)} variant="outline" size="lg">
              Back to Edit
            </Button>
            <Button onClick={submitRequest} disabled={loading} size="lg" className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Submitting...' : 'submit request'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <ShoppingCart className="h-7 w-7 text-blue-600" />
            <h2 className="text-2xl font-bold text-blue-900">Create Stock Request</h2>
          </div>
          <p className="text-blue-700 text-lg">
            Enter job details, select items with +/- buttons, then review and submit your request.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Job Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="jobNumber" className="text-sm font-semibold">Job Number *</Label>
            <Input
              id="jobNumber"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              placeholder="Enter job number (required)"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="notes" className="text-sm font-semibold">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any special instructions or notes"
              className="mt-1"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Select Items {requestItems.length > 0 && `(${requestItems.length} selected)`}
          </CardTitle>
          <p className="text-sm text-gray-600">
            Use the + and - buttons to add items to your request
          </p>
        </CardHeader>
        <CardContent>
          {fetchingItems ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading inventory items...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No inventory items available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => {
                const requested = requestItems.find(r => r.item_id === item.id)?.quantity_requested || 0;
                return (
                  <Card key={item.id} className={`transition-all duration-200 ${requested > 0 ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          {item.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {item.quantity} available
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    
                    {/* Item Image */}
                    <div className="px-4 pb-3">
                      <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                        {item.image_url ? (
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
                    </div>

                    {/* Category Badge */}
                    <div className="px-4 pb-3">
                      <Badge variant="secondary" className="text-xs">
                        {item.category}
                      </Badge>
                    </div>
                    
                    <CardContent>
                      <div className="flex items-center justify-center">
                        <div className="flex items-center gap-4">
                          <Button
                            size="lg"
                            variant="outline"
                            onClick={() => updateRequestQuantity(item.id, item.name, -1)}
                            disabled={requested === 0}
                            className="h-10 w-10 p-0 border-2"
                          >
                            <Minus className="h-5 w-5" />
                          </Button>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600 min-w-[3rem]">
                              {requested}
                            </div>
                            <div className="text-xs text-gray-500">requested</div>
                          </div>
                          <Button
                            size="lg"
                            onClick={() => updateRequestQuantity(item.id, item.name, 1)}
                            disabled={requested >= item.quantity}
                            className="h-10 w-10 p-0 bg-blue-600 hover:bg-blue-700"
                          >
                            <Plus className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {requestItems.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button 
            onClick={() => setShowReview(true)}
            className="bg-blue-600 hover:bg-blue-700 shadow-xl text-lg px-6 py-3 h-auto"
            size="lg"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Review Request ({requestItems.length} items)
          </Button>
        </div>
      )}
    </div>
  );
};