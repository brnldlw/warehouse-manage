import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserCheck, Activity, Package, Clock, Truck, Wrench, ArrowRightLeft, Loader2 } from 'lucide-react';
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
  truck_id?: string;
  truck_name?: string;
  truck_identifier?: string;
  tool_count?: number;
}

interface TechActivity {
  id: string;
  user_id: string;
  action: string;
  item_name: string;
  details: any;
  timestamp: string;
  user_name: string;
}

export const TechManagement: React.FC = () => {
  const [techs, setTechs] = useState<TechUser[]>([]);
  const [activities, setActivities] = useState<TechActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  useEffect(() => {
    if (userProfile?.company_id) {
      loadPageData();
    }
  }, [userProfile?.company_id]);

  const loadPageData = async () => {
    setPageLoading(true);
    try {
      await Promise.all([fetchTechs(), fetchTechActivities()]);
    } finally {
      setPageLoading(false);
    }
  };

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

      // Get truck assignments
      const techIds = data?.map(t => t.id) || [];
      const { data: assignmentsData } = await supabase
        .from('user_truck_assignments')
        .select('user_id, truck_id, trucks:truck_id (id, name, identifier)')
        .in('user_id', techIds)
        .eq('company_id', userProfile.company_id);

      // Get tool counts per truck
      const truckIds = assignmentsData?.map(a => a.truck_id).filter(Boolean) || [];
      let toolCounts: Record<string, number> = {};
      
      if (truckIds.length > 0) {
        const { data: toolsData } = await supabase
          .from('inventory_items')
          .select('assigned_truck_id')
          .eq('company_id', userProfile.company_id)
          .eq('location_type', 'truck')
          .in('assigned_truck_id', truckIds);

        toolCounts = (toolsData || []).reduce((acc, tool) => {
          acc[tool.assigned_truck_id] = (acc[tool.assigned_truck_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
      }

      // Map assignments to techs
      const assignmentMap = (assignmentsData || []).reduce((acc, a) => {
        const truck = a.trucks as any;
        acc[a.user_id] = {
          truck_id: a.truck_id,
          truck_name: truck?.name,
          truck_identifier: truck?.identifier,
          tool_count: toolCounts[a.truck_id] || 0
        };
        return acc;
      }, {} as Record<string, any>);

      const techsWithTrucks: TechUser[] = (data || []).map(tech => ({
        ...tech,
        truck_id: assignmentMap[tech.id]?.truck_id,
        truck_name: assignmentMap[tech.id]?.truck_name,
        truck_identifier: assignmentMap[tech.id]?.truck_identifier,
        tool_count: assignmentMap[tech.id]?.tool_count || 0
      }));

      setTechs(techsWithTrucks);
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
          timestamp
        `)
        .eq('company_id', userProfile.company_id)
        .in('action', ['transferred', 'added', 'used', 'received'])
        .order('timestamp', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Get user names for the activities
      const userIds = [...new Set(data?.map(a => a.user_id).filter(Boolean) || [])];
      let userMap: Record<string, string> = {};
      
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name')
          .in('id', userIds);

        userMap = (usersData || []).reduce((acc, u) => {
          acc[u.id] = `${u.first_name} ${u.last_name}`;
          return acc;
        }, {} as Record<string, string>);
      }
      
      const formattedActivities = data?.map(activity => ({
        id: activity.id,
        user_id: activity.user_id,
        action: activity.action,
        item_name: activity.details?.item_name || activity.details?.tool_name || '',
        details: activity.details,
        timestamp: activity.timestamp,
        user_name: userMap[activity.user_id] || 'Unknown'
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
      {pageLoading ? (
        <Card className="text-center py-12">
          <CardContent>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading technicians...</p>
          </CardContent>
        </Card>
      ) : (
        <>
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
                <TableHead>Assigned Van</TableHead>
                <TableHead>Tools</TableHead>
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
                  <TableCell>
                    {tech.truck_name ? (
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-blue-600" />
                        <span>{tech.truck_name}</span>
                        <Badge variant="outline" className="text-xs">{tech.truck_identifier}</Badge>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No van assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Wrench className="h-4 w-4 text-gray-400" />
                      <span>{tech.tool_count || 0}</span>
                    </div>
                  </TableCell>
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
            Recent Tool Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activities.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No recent activities</p>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      activity.action === 'transferred' ? 'bg-blue-100' :
                      activity.action === 'added' ? 'bg-green-100' : 'bg-orange-100'
                    }`}>
                      {activity.action === 'transferred' ? (
                        <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Package className={`h-4 w-4 ${
                          activity.action === 'added' ? 'text-green-600' : 'text-orange-600'
                        }`} />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {activity.action === 'transferred' ? (
                          <>
                            {activity.user_name} transferred <span className="text-blue-600">{activity.item_name}</span>
                            {activity.details?.from && activity.details?.to && (
                              <span className="text-gray-600 text-sm">
                                {' '}from {activity.details.from} → {activity.details.to}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {activity.user_name} {activity.action} {activity.item_name}
                          </>
                        )}
                      </p>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant={
                    activity.action === 'transferred' ? 'default' :
                    activity.action === 'added' ? 'default' : 'secondary'
                  }>
                    {activity.action}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
};