import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar, Shield, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Warranty {
  id: string;
  job_number: string;
  part_name: string;
  serial_number: string;
  warranty_start: string;
  warranty_end: string;
  customer_info: string;
  notes?: string;
  status: 'active' | 'expired' | 'claimed';
}

export const WarrantyTracker: React.FC = () => {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [newWarranty, setNewWarranty] = useState({
    job_number: '',
    part_name: '',
    serial_number: '',
    warranty_start: '',
    warranty_end: '',
    customer_info: '',
    notes: ''
  });
  const { userProfile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (userProfile?.company_id) {
      fetchWarranties();
    }
  }, [userProfile?.company_id]);

  const fetchWarranties = async () => {
    try {
      if (!userProfile?.company_id) {
        console.warn('No company_id found for current user');
        return;
      }

      const { data, error } = await supabase
        .from('warranties')
        .select('*')
        .eq('company_id', userProfile.company_id)
        .order('warranty_end', { ascending: true });
      
      if (error) throw error;
      setWarranties(data || []);
    } catch (error) {
      console.error('Error fetching warranties:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch warranties',
        variant: 'destructive',
      });
    }
  };

  const addWarranty = async () => {
    if (!newWarranty.job_number || !newWarranty.part_name) return;
    
    if (!userProfile?.company_id) {
      toast({
        title: 'Error',
        description: 'Company information not found',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('warranties')
        .insert([{
          ...newWarranty,
          status: 'active',
          company_id: userProfile.company_id
        }]);
      
      if (error) throw error;
      
      setNewWarranty({
        job_number: '',
        part_name: '',
        serial_number: '',
        warranty_start: '',
        warranty_end: '',
        customer_info: '',
        notes: ''
      });
      
      fetchWarranties();
      toast({
        title: 'Success',
        description: 'Warranty added successfully',
      });
    } catch (error) {
      console.error('Error adding warranty:', error);
      toast({
        title: 'Error',
        description: 'Failed to add warranty',
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string, endDate: string) => {
    if (status === 'expired') return 'bg-red-500';
    if (new Date(endDate) < new Date()) return 'bg-orange-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Add New Warranty
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="job_number">Job Number</Label>
              <Input
                id="job_number"
                value={newWarranty.job_number}
                onChange={(e) => setNewWarranty({...newWarranty, job_number: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="part_name">Part Name</Label>
              <Input
                id="part_name"
                value={newWarranty.part_name}
                onChange={(e) => setNewWarranty({...newWarranty, part_name: e.target.value})}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="serial_number">Serial Number</Label>
              <Input
                id="serial_number"
                value={newWarranty.serial_number}
                onChange={(e) => setNewWarranty({...newWarranty, serial_number: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="customer_info">Customer Info</Label>
              <Input
                id="customer_info"
                value={newWarranty.customer_info}
                onChange={(e) => setNewWarranty({...newWarranty, customer_info: e.target.value})}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="warranty_start">Warranty Start</Label>
              <Input
                id="warranty_start"
                type="date"
                value={newWarranty.warranty_start}
                onChange={(e) => setNewWarranty({...newWarranty, warranty_start: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="warranty_end">Warranty End</Label>
              <Input
                id="warranty_end"
                type="date"
                value={newWarranty.warranty_end}
                onChange={(e) => setNewWarranty({...newWarranty, warranty_end: e.target.value})}
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={newWarranty.notes}
              onChange={(e) => setNewWarranty({...newWarranty, notes: e.target.value})}
              rows={3}
            />
          </div>
          
          <Button onClick={addWarranty} className="w-full">
            Add Warranty
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Warranty Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {warranties.map((warranty) => (
              <div key={warranty.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold">{warranty.part_name}</h3>
                    <p className="text-sm text-gray-600">Job: {warranty.job_number}</p>
                  </div>
                  <Badge className={getStatusColor(warranty.status, warranty.warranty_end)}>
                    {warranty.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>Serial: {warranty.serial_number}</div>
                  <div>Customer: {warranty.customer_info}</div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {warranty.warranty_start} to {warranty.warranty_end}
                  </div>
                </div>
                {warranty.notes && (
                  <p className="text-sm text-gray-600 mt-2">{warranty.notes}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};