import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Thermometer, Droplets, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
interface RefrigerantRecord {
  id: string;
  job_number: string;
  refrigerant_type: string;
  amount_used: number;
  amount_recovered: number;
  unit: string;
  date_recorded: string;
  tech_name: string;
  notes?: string;
}

const REFRIGERANT_TYPES = [
  'R-410A', 'R-22', 'R-134a', 'R-404A', 'R-407C', 'R-32', 'R-290', 'R-600a'
];

export const RefrigerantTracker: React.FC = () => {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [records, setRecords] = useState<RefrigerantRecord[]>([]);
  const [newRecord, setNewRecord] = useState({
    job_number: '',
    refrigerant_type: '',
    amount_used: '',
    amount_recovered: '',
    unit: 'lbs',
    tech_name: '',
    notes: ''
  });

  useEffect(() => {
    if (userProfile?.company_id) {
      fetchRecords();
    }
  }, [userProfile?.company_id]);

  const fetchRecords = async () => {
    try {
      if (!userProfile?.company_id) {
        console.warn('No company_id found for current user');
        return;
      }

      const { data, error } = await supabase
        .from('refrigerant_usage')
        .select('*')
        .eq('company_id', userProfile.company_id)
        .order('date_recorded', { ascending: false });
      
      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error('Error fetching refrigerant records:', error);
      toast({
        title: "Error",
        description: "Failed to fetch refrigerant records",
        variant: "destructive"
      });
    }
  };

  const addRecord = async () => {
    if (!newRecord.job_number.trim()) {
      toast({
        title: "Validation Error",
        description: "Job number is required",
        variant: "destructive"
      });
      return;
    }
    
    if (!newRecord.refrigerant_type) {
      toast({
        title: "Validation Error", 
        description: "Please select a refrigerant type",
        variant: "destructive"
      });
      return;
    }
    
    if (!userProfile?.company_id) {
      toast({
        title: "Error",
        description: "Company information not found",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('refrigerant_usage')
        .insert([{
          job_number: newRecord.job_number,
          refrigerant_type: newRecord.refrigerant_type,
          amount_used: parseFloat(newRecord.amount_used) || 0,
          amount_recovered: parseFloat(newRecord.amount_recovered) || 0,
          unit: newRecord.unit,
          tech_name: newRecord.tech_name,
          notes: newRecord.notes,
          date_recorded: new Date().toISOString(),
          company_id: userProfile.company_id
        }]);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Refrigerant usage recorded successfully"
      });
      
      setNewRecord({
        job_number: '',
        refrigerant_type: '',
        amount_used: '',
        amount_recovered: '',
        unit: 'lbs',
        tech_name: '',
        notes: ''
      });
      
      fetchRecords();
    } catch (error) {
      console.error('Error adding refrigerant record:', error);
      toast({
        title: "Error",
        description: "Failed to record refrigerant usage",
        variant: "destructive"
      });
    }
  };

  const getTotalUsage = (type: string) => {
    return records
      .filter(r => r.refrigerant_type === type)
      .reduce((sum, r) => sum + r.amount_used, 0);
  };

  const getTotalRecovered = (type: string) => {
    return records
      .filter(r => r.refrigerant_type === type)
      .reduce((sum, r) => sum + r.amount_recovered, 0);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            Record Refrigerant Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="job_number">Job Number</Label>
              <Input
                id="job_number"
                value={newRecord.job_number}
                onChange={(e) => setNewRecord({...newRecord, job_number: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="tech_name">Technician Name</Label>
              <Input
                id="tech_name"
                value={newRecord.tech_name}
                onChange={(e) => setNewRecord({...newRecord, tech_name: e.target.value})}
              />
            </div>
          </div>
          
          <div>
            <Label>Refrigerant Type</Label>
            <Select value={newRecord.refrigerant_type} onValueChange={(value) => setNewRecord({...newRecord, refrigerant_type: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select refrigerant type" />
              </SelectTrigger>
              <SelectContent>
                {REFRIGERANT_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="amount_used">Amount Used</Label>
              <Input
                id="amount_used"
                type="number"
                step="0.1"
                value={newRecord.amount_used}
                onChange={(e) => setNewRecord({...newRecord, amount_used: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="amount_recovered">Amount Recovered</Label>
              <Input
                id="amount_recovered"
                type="number"
                step="0.1"
                value={newRecord.amount_recovered}
                onChange={(e) => setNewRecord({...newRecord, amount_recovered: e.target.value})}
              />
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={newRecord.unit} onValueChange={(value) => setNewRecord({...newRecord, unit: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lbs">lbs</SelectItem>
                  <SelectItem value="oz">oz</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button onClick={addRecord} className="w-full">
            Record Usage
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REFRIGERANT_TYPES.slice(0, 3).map(type => (
          <Card key={type}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{type}</h3>
                <Droplets className="h-5 w-5 text-blue-500" />
              </div>
              <div className="space-y-1 text-sm">
                <div>Used: {getTotalUsage(type).toFixed(1)} lbs</div>
                <div>Recovered: {getTotalRecovered(type).toFixed(1)} lbs</div>
                <div className="text-green-600">
                  Net: {(getTotalRecovered(type) - getTotalUsage(type)).toFixed(1)} lbs
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {records.slice(0, 10).map((record) => (
              <div key={record.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">Job: {record.job_number}</div>
                    <div className="text-sm text-gray-600">{record.tech_name}</div>
                  </div>
                  <Badge variant="outline">{record.refrigerant_type}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                  <div>Used: {record.amount_used} {record.unit}</div>
                  <div>Recovered: {record.amount_recovered} {record.unit}</div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(record.date_recorded).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};