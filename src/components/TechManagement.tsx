import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserCheck, Activity, Package, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface TechUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  specialty?: string;
  status: string;
  created_at: string;
}

interface TechActivity {
  id: string;
  user_id: string;
  action: string;
  item_name: string;
  quantity_change: number;
  timestamp: string;
  user_name: string;
}

export const TechManagement: React.FC = () => {
  const [techs, setTechs] = useState<TechUser[]>([]);
  const [activities, setActivities] = useState<TechActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  useEffect(() => {
    if (userProfile?.company_id) {
      fetchTechs();
      fetchTechActivities();
    }
  }, [userProfile?.company_id]);

  const fetchTechs = async () => {
    try {
      if (!userProfile?.company_id) {
        console.warn('No company_id found for current user');
        return;
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, phone, specialty, status, created_at')
        .eq('role', 'tech')
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTechs(data || []);
    } catch (error) {
      console.error('Error fetching techs:', error);
      toast({
        title: 'Error',
        description: `Failed to fetch technicians: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const fetchTechActivities = async () => {
    try {
      if (!userProfile?.company_id) {
        console.warn('No company_id found for current user');
        return;
      }

      const { data, error } = await supabase
        .from('activity_logs')
        .select(`
          id,
          user_id,
          action,
          details,
          timestamp,
          user:user_id (
            first_name,
            last_name,
            role
          )
        `)
        .eq('company_id', userProfile.company_id)
        .order('timestamp', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      const formattedActivities = data?.map(activity => ({
        id: activity.id,
        user_id: activity.user_id,
        action: activity.action,
        item_name: activity.details?.item_name || '',
        quantity_change: activity.details?.quantity || 0,
        timestamp: activity.timestamp,
        user_name: activity.user && Array.isArray(activity.user) && activity.user[0] ? 
          `${activity.user[0].first_name} ${activity.user[0].last_name}` : 'Unknown'
      })) || [];
      
      setActivities(formattedActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast({
        title: 'Error',
        description: `Failed to fetch activities: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const toggleTechStatus = async (techId: string, currentStatus: string) => {
    setLoading(true);
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ status: newStatus, is_active: newStatus === 'active' })
        .eq('id', techId);

      if (error) throw error;

      await fetchTechs();
      toast({
        title: 'Success',
        description: `Technician status updated to ${newStatus}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update technician status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Techs</p>
                <p className="text-3xl font-bold text-blue-600">{techs.length}</p>
              </div>
              <UserCheck className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Techs</p>
                <p className="text-3xl font-bold text-green-600">
                  {techs.filter(t => t.status === 'active').length}
                </p>
              </div>
              <UserCheck className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Recent Activities</p>
                <p className="text-3xl font-bold text-orange-600">{activities.length}</p>
              </div>
              <Activity className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Technicians Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Technicians
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Specialty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {techs.map((tech) => (
                <TableRow key={tech.id}>
                  <TableCell className="font-medium">
                    {tech.first_name} {tech.last_name}
                  </TableCell>
                  <TableCell>{tech.email}</TableCell>
                  <TableCell>{tech.specialty || 'Not specified'}</TableCell>
                  <TableCell>
                    <Badge variant={tech.status === 'active' ? 'default' : 'secondary'}>
                      {tech.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(tech.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={tech.status === 'active' ? 'destructive' : 'default'}
                      onClick={() => toggleTechStatus(tech.id, tech.status)}
                      disabled={loading}
                    >
                      {tech.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Tech Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    activity.action === 'added' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    <Package className={`h-4 w-4 ${
                      activity.action === 'added' ? 'text-green-600' : 'text-red-600'
                    }`} />
                  </div>
                  <div>
                    <p className="font-medium">
                      {activity.user_name} {activity.action} {activity.quantity_change} {activity.item_name}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Badge variant={activity.action === 'added' ? 'default' : 'destructive'}>
                  {activity.action}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};