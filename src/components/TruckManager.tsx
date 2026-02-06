import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Truck, TruckAssignment } from '@/types/truck';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Truck as TruckIcon, Plus, Users, Loader2 } from 'lucide-react';

export const TruckManager: React.FC = () => {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [assignments, setAssignments] = useState<TruckAssignment[]>([]);
  const [newTruck, setNewTruck] = useState({ name: '', identifier: '' });
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const { toast } = useToast();
  const { isAdmin, userProfile } = useAuth();

  useEffect(() => {
    if (userProfile?.company_id) {
      loadPageData();
    }
  }, [userProfile?.company_id]);

  const loadPageData = async () => {
    setPageLoading(true);
    try {
      await Promise.all([loadTrucks(), loadAssignments()]);
    } finally {
      setPageLoading(false);
    }
  };

  const loadTrucks = async () => {
    try {
      if (!userProfile?.company_id) {
        console.warn('No company_id found for current user');
        return;
      }

      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTrucks(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load trucks",
        variant: "destructive"
      });
    }
  };

  const loadAssignments = async () => {
    try {
      if (!userProfile?.company_id) {
        console.warn('No company_id found for current user');
        return;
      }

      const { data, error } = await supabase
        .from('user_truck_assignments')
        .select('*')
        .eq('company_id', userProfile.company_id);
      
      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  const addTruck = async () => {
    if (!newTruck.name || !newTruck.identifier) return;
    
    if (!userProfile?.company_id) {
      toast({
        title: "Error",
        description: "Company information not found",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trucks')
        .insert({
          name: newTruck.name,
          identifier: newTruck.identifier,
          company_id: userProfile.company_id
        })
        .select('*');

      if (error) throw error;
      
      setTrucks(prev => [data[0], ...prev]);
      setNewTruck({ name: '', identifier: '' });
      toast({
        title: "Success",
        description: "Truck added successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add truck",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const getAssignedUsers = (truckId: string) => {
    return assignments.filter(a => a.truck_id === truckId).length;
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TruckIcon className="h-5 w-5" />
              Vehicle Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-gray-600">You don't have permission to manage vehicles.</p>
              <p className="text-sm text-gray-500 mt-2">Only administrators can add or modify vehicles.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pageLoading ? (
        <Card className="text-center py-12">
          <CardContent>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading trucks...</p>
          </CardContent>
        </Card>
      ) : (
        <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TruckIcon className="h-5 w-5" />
            Add New Truck/Van
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="truck-name">Truck/Van Name</Label>
              <Input
                id="truck-name"
                value={newTruck.name}
                onChange={(e) => setNewTruck(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Van 1, Truck A"
              />
            </div>
            <div>
              <Label htmlFor="identifier">Identifier (License Plate)</Label>
              <Input
                id="identifier"
                value={newTruck.identifier}
                onChange={(e) => setNewTruck(prev => ({ ...prev, identifier: e.target.value }))}
                placeholder="e.g., ABC-123"
              />
            </div>
          </div>
          <Button onClick={addTruck} disabled={loading || !isAdmin} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Truck/Van
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trucks.map((truck) => (
          <Card key={truck.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <TruckIcon className="h-4 w-4" />
                  {truck.name}
                </span>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {getAssignedUsers(truck.id)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Identifier: {truck.identifier}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Added: {new Date(truck.created_at).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
        </>
      )}
    </div>
  );
};