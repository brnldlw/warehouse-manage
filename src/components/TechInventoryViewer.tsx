import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Package, User, Search, Calendar, Briefcase } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Technician {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface TechInventoryItem {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  remaining_quantity: number;
  used_quantity: number;
  job_number: string;
  received_at: string;
  status: string;
  notes: string;
  image_url?: string;
  category?: string;
}

export const TechInventoryViewer: React.FC = () => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [techInventory, setTechInventory] = useState<TechInventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTechnicians();
  }, []);

  useEffect(() => {
    if (selectedTechId) {
      fetchTechInventory(selectedTechId);
    }
  }, [selectedTechId]);

  const fetchTechnicians = async () => {
    try {
      if (!userProfile?.company_id) return;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .eq('company_id', userProfile.company_id)
        .eq('role', 'tech')
        .eq('is_active', true)
        .order('first_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error fetching technicians:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch technicians',
        variant: 'destructive',
      });
    }
  };

  const fetchTechInventory = async (techId: string) => {
    setLoading(true);
    try {
      if (!userProfile?.company_id) return;

      // Get technician's active inventory
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
        .eq('user_id', techId)
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

      // Create a map of item details
      const itemDetailsMap = inventoryDetails.reduce((acc, item) => {
        acc[item.id] = {
          image_url: item.image_url,
          category: categoryMap[item.category_id] || 'Uncategorized'
        };
        return acc;
      }, {} as Record<string, any>);

      // Transform the data
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

      setTechInventory(transformedData);
    } catch (error) {
      console.error('Error fetching technician inventory:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch technician inventory',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = techInventory.filter(item =>
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.job_number && item.job_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const selectedTech = technicians.find(tech => tech.id === selectedTechId);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Technician Inventory Viewer</h2>
          <p className="text-gray-600">View and monitor technician personal inventories</p>
        </div>
      </div>

      {/* Technician Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Select Technician
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="technician">Technician</Label>
              <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.first_name} {tech.last_name} ({tech.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
          </div>
        </CardContent>
      </Card>

      {selectedTech && (
        <>
          {/* Search and Summary */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedTech.first_name} {selectedTech.last_name}'s Inventory
                  </h3>
                  <p className="text-sm text-gray-600">
                    {filteredInventory.length} active items
                  </p>
                </div>
                
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by item name or job number..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Grid */}
          {loading ? (
            <Card className="text-center py-12">
              <CardContent>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading inventory...</p>
              </CardContent>
            </Card>
          ) : filteredInventory.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {searchTerm ? 'No items found matching your search' : 'No inventory items found for this technician'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredInventory.map((item) => (
                <Card key={item.id} className="bg-white hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-2 truncate">
                        <Package className="h-4 w-4 flex-shrink-0 text-green-600" />
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
                            e.currentTarget.nextSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={item.image_url ? 'hidden' : ''}>
                        <Package className="h-8 w-8 text-gray-400" />
                      </div>
                    </div>
                  </div>
                  
                  <CardContent className="pt-2 space-y-3">
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Category:</span>
                        <span>{item.category || 'Uncategorized'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>From Job:</span>
                        <span className="font-medium flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {item.job_number || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Used:</span>
                        <span>{item.used_quantity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Received:</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(item.received_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    {/* {item.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-gray-500 line-clamp-3">
                          <strong>Notes:</strong> {item.notes}
                        </p>
                      </div>
                    )} */}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
