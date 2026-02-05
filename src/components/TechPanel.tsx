import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Search, Scan, Thermometer, Filter, Image, Truck, Wrench, AlertCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { BarcodeScanner } from './BarcodeScanner';
import { RefrigerantTracker } from './RefrigerantTracker';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface VanTool {
  id: string;
  name: string;
  description?: string;
  serialNumber?: string;
  barcode?: string;
  condition: 'good' | 'fair' | 'poor' | 'damaged';
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  image_url?: string;
  price?: number;
}

export const TechPanel: React.FC = () => {
  const { user, userProfile } = useAuth();
  const isMobile = useIsMobile();
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<'inventory' | 'scanner' | 'refrigerant'>('inventory');
  const [vanTools, setVanTools] = useState<VanTool[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState<string>('');
  const [assignedTruck, setAssignedTruck] = useState<{ id: string; name: string; identifier: string } | null>(null);

  useEffect(() => {
    if (user?.id && userProfile?.company_id) {
      fetchAssignedTruck();
      fetchCategories();
      fetchCompanyName();
    }
  }, [user?.id, userProfile?.company_id]);

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

  const fetchAssignedTruck = async () => {
    if (!user?.id || !userProfile?.company_id) return;
    
    setLoading(true);
    try {
      // Get user's assigned truck
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('user_truck_assignments')
        .select(`
          truck_id,
          trucks:truck_id (id, name, identifier)
        `)
        .eq('user_id', user.id)
        .eq('company_id', userProfile.company_id)
        .single();

      if (assignmentError && assignmentError.code !== 'PGRST116') {
        throw assignmentError;
      }

      if (assignmentData?.trucks) {
        const truck = assignmentData.trucks as any;
        setAssignedTruck({ id: truck.id, name: truck.name, identifier: truck.identifier });
        await fetchVanTools(truck.id);
      } else {
        setAssignedTruck(null);
        setVanTools([]);
      }
    } catch (error) {
      console.error('Error fetching assigned truck:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVanTools = async (truckId: string) => {
    if (!userProfile?.company_id) return;

    try {
      // Get all tools assigned to this truck
      const { data: toolsData, error: toolsError } = await supabase
        .from('inventory_items')
        .select('id, name, description, serial_number, barcode, condition, category_id, image_url, unit_price')
        .eq('company_id', userProfile.company_id)
        .eq('location_type', 'truck')
        .eq('assigned_truck_id', truckId)
        .order('name');

      if (toolsError) throw toolsError;

      // Get categories to map names
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id, name, color')
        .eq('company_id', userProfile.company_id);

      const categoryMap = (categoriesData || []).reduce((acc, cat) => {
        acc[cat.id] = { name: cat.name, color: cat.color };
        return acc;
      }, {} as Record<string, { name: string; color: string }>);

      const transformedTools: VanTool[] = (toolsData || []).map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        serialNumber: tool.serial_number,
        barcode: tool.barcode,
        condition: tool.condition || 'good',
        categoryId: tool.category_id,
        categoryName: categoryMap[tool.category_id]?.name || 'Uncategorized',
        categoryColor: categoryMap[tool.category_id]?.color || '#6B7280',
        image_url: tool.image_url,
        price: tool.unit_price
      }));

      setVanTools(transformedTools);
    } catch (error) {
      console.error('Error fetching van tools:', error);
    }
  };

  const fetchCategories = async () => {
    if (!userProfile?.company_id) return;
    
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('company_id', userProfile.company_id)
        .order('name');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
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

  const filteredTools = vanTools.filter(tool => {
    const matchesSearch = 
      tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tool.serialNumber && tool.serialNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (tool.barcode && tool.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || tool.categoryId === selectedCategory;
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
              {assignedTruck ? (
                <div className="text-gray-600 flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Assigned to: <span className="font-medium">{assignedTruck.name}</span>
                  <Badge variant="outline">{assignedTruck.identifier}</Badge>
                </div>
              ) : (
                <div className="text-orange-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  No van assigned. Contact your administrator.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <Button
            onClick={() => setActiveView('inventory')}
            variant={activeView === 'inventory' ? 'default' : 'outline'}
            className={`flex items-center gap-2 ${activeView === 'inventory' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
            size="lg"
          >
            <Wrench className="h-4 w-4" />
            My Van Tools
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
            onClick={() => setActiveView('refrigerant')}
            variant={activeView === 'refrigerant' ? 'default' : 'outline'}
            className="flex items-center gap-2"
          >
            <Thermometer className="h-4 w-4" />
            Refrigerant Tracker
          </Button>
        </div>

        {/* Content based on active view */}
        {activeView === 'scanner' && (
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scan className="h-5 w-5" />
                  Barcode Scanner
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Scan barcodes to search for tools in your van
                </p>
              </CardHeader>
              <CardContent>
                <BarcodeScanner onItemAdded={() => assignedTruck && fetchVanTools(assignedTruck.id)} />
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
                        placeholder="Search by name, serial number, or barcode..."
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
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
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

            {/* Loading State */}
            {loading && (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-gray-600">Loading your van tools...</p>
                </CardContent>
              </Card>
            )}

            {/* No Truck Assigned Warning */}
            {!loading && !assignedTruck && (
              <Card className="text-center py-12 border-orange-200 bg-orange-50">
                <CardContent>
                  <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
                  <p className="text-orange-700 font-medium">No van assigned to your account</p>
                  <p className="text-orange-600 text-sm mt-2">Please contact your administrator to be assigned to a van.</p>
                </CardContent>
              </Card>
            )}

            {/* Van Tools Table */}
            {!loading && assignedTruck && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    Tools in {assignedTruck.name}
                    <Badge variant="secondary">{filteredTools.length} items</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {filteredTools.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tool</TableHead>
                            <TableHead>Serial Number</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Condition</TableHead>
                            <TableHead>Barcode</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTools.map((tool) => (
                            <TableRow key={tool.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  {tool.image_url ? (
                                    <img 
                                      src={tool.image_url} 
                                      alt={tool.name}
                                      className="h-10 w-10 rounded object-cover"
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                                      <Image className="h-5 w-5 text-gray-400" />
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-medium">{tool.name}</p>
                                    {tool.description && (
                                      <p className="text-sm text-gray-500 truncate max-w-[200px]">{tool.description}</p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="font-mono text-sm">{tool.serialNumber || '-'}</span>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline"
                                  style={{ 
                                    borderColor: tool.categoryColor,
                                    color: tool.categoryColor
                                  }}
                                >
                                  {tool.categoryName}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={getConditionBadge(tool.condition)}>
                                  {tool.condition.charAt(0).toUpperCase() + tool.condition.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className="font-mono text-sm">{tool.barcode || '-'}</span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">
                        {searchTerm || selectedCategory !== 'all' 
                          ? 'No tools match your search criteria'
                          : 'No tools assigned to your van yet'}
                      </p>
                    </div>
                  )}
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