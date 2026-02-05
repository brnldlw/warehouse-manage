import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, User, Search, Truck, Wrench, Image, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Technician {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  truck_id?: string;
  truck_name?: string;
  truck_identifier?: string;
}

interface VanTool {
  id: string;
  name: string;
  description?: string;
  serial_number?: string;
  barcode?: string;
  condition: 'good' | 'fair' | 'poor' | 'damaged';
  category_name?: string;
  category_color?: string;
  image_url?: string;
  unit_price?: number;
}

export const TechInventoryViewer: React.FC = () => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [vanTools, setVanTools] = useState<VanTool[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTechnicians();
  }, [userProfile?.company_id]);

  useEffect(() => {
    if (selectedTechId) {
      fetchTechVanTools(selectedTechId);
    }
  }, [selectedTechId]);

  const fetchTechnicians = async () => {
    try {
      if (!userProfile?.company_id) return;

      // Get all technicians
      const { data: techsData, error: techsError } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .eq('company_id', userProfile.company_id)
        .eq('role', 'tech')
        .eq('is_active', true)
        .order('first_name');

      if (techsError) throw techsError;

      // Get truck assignments for all techs
      const techIds = techsData?.map(t => t.id) || [];
      const { data: assignmentsData } = await supabase
        .from('user_truck_assignments')
        .select('user_id, truck_id, trucks:truck_id (id, name, identifier)')
        .in('user_id', techIds)
        .eq('company_id', userProfile.company_id);

      // Map assignments to techs
      const assignmentMap = (assignmentsData || []).reduce((acc, a) => {
        const truck = a.trucks as any;
        acc[a.user_id] = {
          truck_id: a.truck_id,
          truck_name: truck?.name,
          truck_identifier: truck?.identifier
        };
        return acc;
      }, {} as Record<string, { truck_id: string; truck_name: string; truck_identifier: string }>);

      const techsWithTrucks: Technician[] = (techsData || []).map(tech => ({
        ...tech,
        truck_id: assignmentMap[tech.id]?.truck_id,
        truck_name: assignmentMap[tech.id]?.truck_name,
        truck_identifier: assignmentMap[tech.id]?.truck_identifier
      }));

      setTechnicians(techsWithTrucks);
    } catch (error) {
      console.error('Error fetching technicians:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch technicians',
        variant: 'destructive',
      });
    }
  };

  const fetchTechVanTools = async (techId: string) => {
    setLoading(true);
    try {
      if (!userProfile?.company_id) return;

      const tech = technicians.find(t => t.id === techId);
      if (!tech?.truck_id) {
        setVanTools([]);
        setLoading(false);
        return;
      }

      // Get tools assigned to this tech's truck
      const { data: toolsData, error: toolsError } = await supabase
        .from('inventory_items')
        .select('id, name, description, serial_number, barcode, condition, category_id, image_url, unit_price')
        .eq('company_id', userProfile.company_id)
        .eq('location_type', 'truck')
        .eq('assigned_truck_id', tech.truck_id)
        .order('name');

      if (toolsError) throw toolsError;

      // Get categories
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
        serial_number: tool.serial_number,
        barcode: tool.barcode,
        condition: tool.condition || 'good',
        category_name: categoryMap[tool.category_id]?.name || 'Uncategorized',
        category_color: categoryMap[tool.category_id]?.color || '#6B7280',
        image_url: tool.image_url,
        unit_price: tool.unit_price
      }));

      setVanTools(transformedTools);
    } catch (error) {
      console.error('Error fetching van tools:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch van tools',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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

  const filteredTools = vanTools.filter(tool =>
    tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tool.serial_number && tool.serial_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (tool.barcode && tool.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const selectedTech = technicians.find(tech => tech.id === selectedTechId);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Technician Van Tools</h2>
          <p className="text-gray-600">View tools assigned to each technician's van</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="technician">Technician</Label>
              <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      <div className="flex items-center gap-2">
                        <span>{tech.first_name} {tech.last_name}</span>
                        {tech.truck_name && (
                          <Badge variant="outline" className="text-xs">
                            <Truck className="h-3 w-3 mr-1" />
                            {tech.truck_identifier}
                          </Badge>
                        )}
                      </div>
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
          {/* Tech Info & Search */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedTech.first_name} {selectedTech.last_name}
                  </h3>
                  {selectedTech.truck_name ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                      <Truck className="h-4 w-4" />
                      <span>{selectedTech.truck_name}</span>
                      <Badge variant="outline">{selectedTech.truck_identifier}</Badge>
                      <span className="text-gray-400">•</span>
                      <span>{filteredTools.length} tools</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-orange-600 mt-1">
                      <AlertCircle className="h-4 w-4" />
                      <span>No van assigned to this technician</span>
                    </div>
                  )}
                </div>
                
                {selectedTech.truck_id && (
                  <div className="flex-1 max-w-md">
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
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tools Table */}
          {!selectedTech.truck_id ? (
            <Card className="text-center py-12 border-orange-200 bg-orange-50">
              <CardContent>
                <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
                <p className="text-orange-700 font-medium">No van assigned</p>
                <p className="text-orange-600 text-sm mt-2">
                  Assign a van to this technician in the Truck Management section.
                </p>
              </CardContent>
            </Card>
          ) : loading ? (
            <Card className="text-center py-12">
              <CardContent>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading van tools...</p>
              </CardContent>
            </Card>
          ) : filteredTools.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {searchTerm ? 'No tools found matching your search' : 'No tools assigned to this van'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Van Tools
                  <Badge variant="secondary">{filteredTools.length} items</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tool</TableHead>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Barcode</TableHead>
                        <TableHead className="text-right">Value</TableHead>
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
                            <span className="font-mono text-sm">{tool.serial_number || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              style={{ borderColor: tool.category_color, color: tool.category_color }}
                            >
                              {tool.category_name}
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
                          <TableCell className="text-right">
                            {tool.unit_price ? `$${tool.unit_price.toFixed(2)}` : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
