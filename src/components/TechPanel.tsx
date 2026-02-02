import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Package, Plus, Minus, Search, Scan, ShoppingCart, Inbox, CheckSquare, Thermometer, Filter, Image } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { InventorySearch } from './InventorySearch';
import { BarcodeScanner } from './BarcodeScanner';
import { RequestItems } from './RequestItems';
import { ReceiveItems } from './ReceiveItems';
import { RefrigerantTracker } from './RefrigerantTracker';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { checkAndSendLowStockAlert, checkAndSendTechLowStockAlert } from '@/lib/lowStockAlert';

interface Category {
  id: string;
  name: string;
}

interface TechInventoryItem {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  remaining_quantity: number;
  used_quantity: number;
  job_number?: string;
  received_at: string;
  status: string;
  notes?: string;
  image_url?: string;
  category?: string;
}

export const TechPanel: React.FC = () => {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<'inventory' | 'request' | 'receive' | 'scanner' | 'search' | 'refrigerant'>('request');
  const [items, setItems] = useState<TechInventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    fetchInventory();
    fetchCategories();
    fetchCompanyName();
  }, []);

  const fetchCompanyName = async () => {
    if (!userProfile?.company_id) return;
    
    try {
      const { data: companyData, error } = await supabase
        .from('companies')
        .select('name')
        .eq('id', userProfile.company_id)
        .single();
      
      if (error) throw error;
      if (companyData?.name) {
        setCompanyName(companyData.name);
      }
    } catch (error) {
      console.error('Error fetching company name:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      if (!user?.id || !userProfile?.company_id) return;

      // Get technician's personal inventory
      const { data: techInventoryData, error: techInventoryError } = await supabase
        .from('technician_inventory')
        .select(`
          id,
          item_id,
          item_name,
          quantity,
          remaining_quantity,
          used_quantity,
          job_number,
          received_at,
          status,
          notes
        `)
        .eq('user_id', user.id)
        .eq('company_id', userProfile.company_id)
        .eq('status', 'active')
        .gt('remaining_quantity', 0)
        .order('received_at', { ascending: false });

      if (techInventoryError) throw techInventoryError;

      // Get inventory items details for images and categories
      const itemIds = techInventoryData?.map(item => item.item_id) || [];
      let inventoryDetails = [];
      let categoriesData = [];
      
      if (itemIds.length > 0) {
        // Get inventory items with image_url and category_id
        const { data: inventoryData, error: inventoryError } = await supabase
          .from('inventory_items')
          .select('id, image_url, category_id')
          .in('id', itemIds);

        if (!inventoryError) {
          inventoryDetails = inventoryData || [];
        }

        // Get all categories
        const { data: catData, error: catError } = await supabase
          .from('categories')
          .select('id, name');

        if (!catError) {
          categoriesData = catData || [];
        }
      }

      // Create category map
      const categoryMap = categoriesData.reduce((acc, cat) => {
        acc[cat.id] = cat.name;
        return acc;
      }, {} as Record<string, string>);

      // Create a map of item details (using item.id as key to match item_id from technician_inventory)
      const itemDetailsMap = inventoryDetails.reduce((acc, item) => {
        acc[item.id] = {
          image_url: item.image_url,
          category: categoryMap[item.category_id] || 'Uncategorized'
        };
        return acc;
      }, {} as Record<string, any>);
      
      // console.log('Inventory details:', inventoryDetails);
      // console.log('Item details map keys:', Object.keys(itemDetailsMap));
      // console.log('Tech inventory item_ids:', techInventoryData?.map(item => item.item_id));

      // Transform the data to match our interface
      const transformedData: TechInventoryItem[] = (techInventoryData || []).map(item => ({
        id: item.id,
        item_id: item.item_id,
        item_name: item.item_name,
        quantity: item.quantity,
        remaining_quantity: item.remaining_quantity,
        used_quantity: item.used_quantity,
        job_number: item.job_number,
        received_at: item.received_at,
        status: item.status,
        notes: item.notes,
        image_url: itemDetailsMap[item.item_id]?.image_url,
        category: itemDetailsMap[item.item_id]?.category
      }));

      // console.log('Technician inventory data:', transformedData);
      // console.log('Item details map:', itemDetailsMap);
      // console.log('Items with images:', transformedData.filter(item => item.image_url));
      
      // Debug each item mapping
      transformedData.forEach(item => {
        const details = itemDetailsMap[item.item_id];
        console.log(`Item ${item.item_name} (ID: ${item.item_id}):`, {
          found_details: !!details,
          image_url: details?.image_url,
          category: details?.category
        });
      });
      setItems(transformedData);
    } catch (error) {
      console.error('Error fetching technician inventory:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch your inventory items',
        variant: 'destructive',
      });
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('name')
        .eq('company_id', userProfile?.company_id)
        .order('name');
      
      if (error) throw error;
      setCategories(data?.map(cat => cat.name) || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const useItem = async (techInventoryId: string, useQuantity: number, jobRef?: string) => {
    setLoading(true);
    try {
      const item = items.find(i => i.id === techInventoryId);
      if (!item) return;

      if (useQuantity > item.remaining_quantity) {
        toast({
          title: 'Error',
          description: 'Cannot use more than available quantity',
          variant: 'destructive',
        });
        return;
      }

      const newUsedQuantity = item.used_quantity + useQuantity;
      const newRemainingQuantity = item.remaining_quantity - useQuantity;
      const newStatus = newRemainingQuantity === 0 ? 'used' : 'active';

      const { error } = await supabase
        .from('technician_inventory')
        .update({
          used_quantity: newUsedQuantity,
          remaining_quantity: newRemainingQuantity,
          status: newStatus,
          notes: item.notes ? 
            `${item.notes}\nUsed ${useQuantity} on ${new Date().toLocaleString()}${jobRef ? ` (Job: ${jobRef})` : ''}` :
            `Used ${useQuantity} on ${new Date().toLocaleString()}${jobRef ? ` (Job: ${jobRef})` : ''}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', techInventoryId);

      if (error) throw error;

      // Log the activity
      await supabase
        .from('activity_logs')
        .insert({
          user_id: user?.id,
          company_id: userProfile?.company_id,
          action: 'used',
          item_id: item.item_id,
          details: {
            item_name: item.item_name,
            quantity_used: useQuantity,
            job_reference: jobRef,
            remaining_quantity: newRemainingQuantity
          },
          timestamp: new Date().toISOString()
        });

      // Check if technician's inventory is below minimum and send alert if needed
      if (user?.id && userProfile?.company_id) {
        await checkAndSendTechLowStockAlert(
          item.item_id, 
          user.id, 
          newRemainingQuantity, 
          userProfile.company_id
        );
      }
      
      await fetchInventory();
      
      toast({
        title: 'Success',
        description: `Used ${useQuantity} ${item.item_name}${jobRef ? ` for job ${jobRef}` : ''}`,
      });
    } catch (error) {
      console.error('Error using item:', error);
      toast({
        title: 'Error',
        description: 'Failed to update item usage',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (item.job_number && item.job_number.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-col items-start gap-2">
            {companyName && (
              <h1 className="text-4xl font-bold text-gray-900">
                {companyName}
              </h1>
            )}
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-gray-700">
                Technician Panel
              </h2>
              <p className="text-gray-600">Request parts, receive items, and manage inventory</p>
            </div>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <Button
            onClick={() => setActiveView('request')}
            variant={activeView === 'request' ? 'default' : 'outline'}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            size="lg"
          >
            <ShoppingCart className="h-4 w-4" />
            Create Stock Request
          </Button>
          <Button
            onClick={() => setActiveView('receive')}
            variant={activeView === 'receive' ? 'default' : 'outline'}
            className="flex items-center gap-2"
          >
            <Inbox className="h-4 w-4" />
            Receive Items
          </Button>
          <Button
            onClick={() => setActiveView('scanner')}
            variant={activeView === 'scanner' ? 'default' : 'outline'}
            className="flex items-center gap-2"
          >
            <Scan className="h-4 w-4" />
            Barcode Scanner
          </Button>
          <Button
            onClick={() => setActiveView('inventory')}
            variant={activeView === 'inventory' ? 'default' : 'outline'}
            className="flex items-center gap-2"
          >
            <Package className="h-4 w-4" />
            My Inventory
          </Button>
          <Button
            onClick={() => setActiveView('refrigerant')}
            variant={activeView === 'refrigerant' ? 'default' : 'outline'}
            className="flex items-center gap-2"
          >
            <Thermometer className="h-4 w-4" />
            Refrigerant Tracker
          </Button>
        </div>

        {/* Content based on active view */}
        {activeView === 'request' && <RequestItems />}
        {activeView === 'receive' && <ReceiveItems />}
        {activeView === 'scanner' && (
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scan className="h-5 w-5" />
                  Barcode Scanner
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Scan barcodes to search for existing items or add new inventory
                </p>
              </CardHeader>
              <CardContent>
                <BarcodeScanner onItemAdded={fetchInventory} />
              </CardContent>
            </Card>
          </div>
        )}
        {activeView === 'inventory' && (
          <div className="space-y-6">
            {/* Search and Filter */}
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Mobile Search Header */}
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="search"
                        type="search"
                        inputMode="search"
                        placeholder="Search by item name or job number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-full"
                      />
                    </div>
                    {isMobile && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex-shrink-0"
                      >
                        <Filter className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Filters Section */}
                  <div className={`${isMobile && !showFilters ? 'hidden' : 'block'} space-y-4 md:space-y-0 md:flex md:gap-4 md:items-end`}>
                    <div className={`${isMobile ? 'w-full' : 'w-48'}`}>
                      <Label htmlFor="category">Category</Label>
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => setActiveView('scanner')}
                      variant="outline"
                      className="flex items-center gap-2 w-full md:w-auto"
                    >
                      <Scan className="h-4 w-4" />
                      Scan Barcode
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Technician Inventory Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => (
                <Card key={item.id} className="bg-white hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-2 truncate">
                        <Package className="h-4 w-4 text-green-600 flex-shrink-0" />
                        {item.item_name}
                      </span>
                      <div className="flex gap-1">
                        <Badge variant="default" className="bg-green-600">
                          {item.remaining_quantity}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          /{item.quantity}
                        </Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  
                  {/* Item Image */}
                  <div className="px-6">
                    <div className="aspect-[4/3] bg-gray-100 rounded-md flex items-center justify-center overflow-hidden relative">
                      {item.image_url ? (
                        <img 
                          src={item.image_url} 
                          alt={item.item_name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const nextElement = e.currentTarget.nextSibling as HTMLElement;
                            if (nextElement && nextElement.classList) {
                              nextElement.classList.remove('hidden');
                            }
                          }}
                        />
                      ) : null}
                      <div className={item.image_url ? 'hidden' : ''}>
                        <Image className="h-8 w-8 text-gray-400" />
                      </div>
                    </div>
                  </div>
                  
                  <CardContent className="pt-2 space-y-3">
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Category:</span>
                        <span>{item.category || 'Uncategorized'}</span>
                      </div>
                      {/* <div className="flex justify-between">
                        <span>From Job:</span>
                        <span className="font-medium">{item.job_number || 'N/A'}</span>
                      </div> */}
                      
                      <div className="flex justify-between">
                        <span>Used:</span>
                        <span>{item.used_quantity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Received:</span>
                        <span>{new Date(item.received_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    {/* Use Item Controls */}
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="1"
                          max={item.remaining_quantity}
                          defaultValue="1"
                          className="flex-1 h-8"
                          id={`use-quantity-${item.id}`}
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            const quantityInput = document.getElementById(`use-quantity-${item.id}`) as HTMLInputElement;
                            const jobInput = document.getElementById(`job-ref-${item.id}`) as HTMLInputElement;
                            const useQuantity = parseInt(quantityInput.value) || 1;
                            const jobRef = jobInput.value.trim() || undefined;
                            useItem(item.id, useQuantity, jobRef);
                          }}
                          disabled={loading || item.remaining_quantity === 0}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          <Minus className="h-3 w-3 mr-1" />
                          Use
                        </Button>
                      </div>
                      <Input
                        placeholder="Job reference (optional)"
                        className="h-8 text-xs"
                        id={`job-ref-${item.id}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredItems.length === 0 && (
              <Card className="text-center py-12">
                <CardContent>
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No items in your personal inventory. Request items to get started!</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        {activeView === 'refrigerant' && <RefrigerantTracker />}
      </div>
    </div>
  );
};