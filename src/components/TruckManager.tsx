import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Truck, TruckAssignment } from '@/types/truck';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Truck as TruckIcon, Plus, Users, Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react';

export const TruckManager: React.FC = () => {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [assignments, setAssignments] = useState<TruckAssignment[]>([]);
  const [newTruck, setNewTruck] = useState({ name: '', identifier: '' });
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [editForm, setEditForm] = useState({ name: '', identifier: '' });
  const [deletingTruck, setDeletingTruck] = useState<Truck | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
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

  const openEdit = (truck: Truck) => {
    setEditingTruck(truck);
    setEditForm({ name: truck.name, identifier: truck.identifier });
  };

  const saveEdit = async () => {
    if (!editingTruck || !editForm.name || !editForm.identifier) return;
    setEditLoading(true);
    try {
      const { error } = await supabase
        .from('trucks')
        .update({ name: editForm.name, identifier: editForm.identifier })
        .eq('id', editingTruck.id);
      if (error) throw error;
      setTrucks(prev => prev.map(t => t.id === editingTruck.id ? { ...t, name: editForm.name, identifier: editForm.identifier } : t));
      setEditingTruck(null);
      toast({ title: 'Success', description: 'Truck updated successfully' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update truck', variant: 'destructive' });
    }
    setEditLoading(false);
  };

  const confirmDelete = async () => {
    if (!deletingTruck) return;
    setDeleteLoading(true);
    try {
      // Move all inventory items on this truck back to warehouse
      const { error: invError } = await supabase
        .from('inventory_items')
        .update({ location_type: 'warehouse', assigned_truck_id: null })
        .eq('assigned_truck_id', deletingTruck.id);
      if (invError) throw invError;

      // Nullify truck_id in activity logs (FK is nullable — preserves history)
      const { error: logError } = await supabase
        .from('activity_logs')
        .update({ truck_id: null })
        .eq('truck_id', deletingTruck.id);
      if (logError) throw logError;

      // Delete user-truck assignments
      const { error: assignError } = await supabase
        .from('user_truck_assignments')
        .delete()
        .eq('truck_id', deletingTruck.id);
      if (assignError) throw assignError;

      // Delete the truck
      const { error } = await supabase
        .from('trucks')
        .delete()
        .eq('id', deletingTruck.id);
      if (error) throw error;

      setTrucks(prev => prev.filter(t => t.id !== deletingTruck.id));
      setDeletingTruck(null);
      toast({ title: 'Success', description: 'Van deleted and all tools returned to warehouse' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete van';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
    setDeleteLoading(false);
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
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {getAssignedUsers(truck.id)}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(truck)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setDeletingTruck(truck)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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

      {/* Edit Dialog */}
      <Dialog open={!!editingTruck} onOpenChange={(open) => !open && setEditingTruck(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Truck/Van</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-name">Truck/Van Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Van 1, Truck A"
              />
            </div>
            <div>
              <Label htmlFor="edit-identifier">Identifier (License Plate)</Label>
              <Input
                id="edit-identifier"
                value={editForm.identifier}
                onChange={(e) => setEditForm(prev => ({ ...prev, identifier: e.target.value }))}
                placeholder="e.g., ABC-123"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTruck(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editLoading || !editForm.name || !editForm.identifier}>
              {editLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTruck} onOpenChange={(open) => !open && setDeletingTruck(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingTruck?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingTruck?.name}</strong>?
              <br /><br />
              All tools currently assigned to this van will be automatically returned to the warehouse, and all technician assignments will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};