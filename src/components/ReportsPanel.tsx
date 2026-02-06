import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, Download, Calendar, Plus, Trash2, ArrowRightLeft, 
  Package, Loader2, Truck, Warehouse, Filter, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface ActivityLog {
  id: string;
  action: string;
  item_name: string;
  details: any;
  timestamp: string;
  user_name: string;
}

interface ToolSummary {
  totalTools: number;
  warehouseTools: number;
  truckTools: number;
  addedThisMonth: number;
  deletedThisMonth: number;
  transfersThisMonth: number;
}

export const ReportsPanel: React.FC = () => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [summary, setSummary] = useState<ToolSummary>({
    totalTools: 0,
    warehouseTools: 0,
    truckTools: 0,
    addedThisMonth: 0,
    deletedThisMonth: 0,
    transfersThisMonth: 0
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [trucks, setTrucks] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (userProfile?.company_id) {
      loadData();
    }
  }, [userProfile?.company_id]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSummary(),
        fetchActivities(),
        fetchTrucks()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrucks = async () => {
    if (!userProfile?.company_id) return;

    const { data } = await supabase
      .from('trucks')
      .select('id, name')
      .eq('company_id', userProfile.company_id)
      .order('name');

    setTrucks(data || []);
  };

  const fetchSummary = async () => {
    if (!userProfile?.company_id) return;

    try {
      // Get tool counts by location
      const { data: toolsData } = await supabase
        .from('inventory_items')
        .select('id, location_type')
        .eq('company_id', userProfile.company_id);

      const warehouseTools = toolsData?.filter(t => t.location_type === 'warehouse').length || 0;
      const truckTools = toolsData?.filter(t => t.location_type === 'truck').length || 0;

      // Get this month's activity counts
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: addedData } = await supabase
        .from('activity_logs')
        .select('id')
        .eq('company_id', userProfile.company_id)
        .eq('action', 'added')
        .gte('timestamp', startOfMonth.toISOString());

      const { data: deletedData } = await supabase
        .from('activity_logs')
        .select('id')
        .eq('company_id', userProfile.company_id)
        .eq('action', 'deleted')
        .gte('timestamp', startOfMonth.toISOString());

      const { data: transferData } = await supabase
        .from('activity_logs')
        .select('id')
        .eq('company_id', userProfile.company_id)
        .eq('action', 'transferred')
        .gte('timestamp', startOfMonth.toISOString());

      setSummary({
        totalTools: toolsData?.length || 0,
        warehouseTools,
        truckTools,
        addedThisMonth: addedData?.length || 0,
        deletedThisMonth: deletedData?.length || 0,
        transfersThisMonth: transferData?.length || 0
      });
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const fetchActivities = async () => {
    if (!userProfile?.company_id) return;

    try {
      let query = supabase
        .from('activity_logs')
        .select('id, action, details, timestamp, user_id')
        .eq('company_id', userProfile.company_id)
        .in('action', ['added', 'deleted', 'transferred'])
        .order('timestamp', { ascending: false })
        .limit(100);

      if (dateFrom) {
        query = query.gte('timestamp', new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        query = query.lte('timestamp', endDate.toISOString());
      }
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get user names
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

      const formattedActivities: ActivityLog[] = (data || []).map(activity => ({
        id: activity.id,
        action: activity.action,
        item_name: activity.details?.item_name || activity.details?.tool_name || 'Unknown',
        details: activity.details,
        timestamp: activity.timestamp,
        user_name: userMap[activity.user_id] || 'Unknown'
      }));

      setActivities(formattedActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch activity logs',
        variant: 'destructive'
      });
    }
  };

  const applyFilters = () => {
    fetchActivities();
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setActionFilter('all');
    fetchActivities();
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'added':
        return <Plus className="h-4 w-4 text-green-600" />;
      case 'deleted':
        return <Trash2 className="h-4 w-4 text-red-600" />;
      case 'transferred':
        return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
      default:
        return <Package className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'added':
        return <Badge className="bg-green-100 text-green-800">Added</Badge>;
      case 'deleted':
        return <Badge className="bg-red-100 text-red-800">Deleted</Badge>;
      case 'transferred':
        return <Badge className="bg-blue-100 text-blue-800">Transferred</Badge>;
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const formatTransferDetails = (details: any) => {
    if (!details) return '';
    if (details.from && details.to) {
      return `${details.from} → ${details.to}`;
    }
    return '';
  };

  const exportToCSV = () => {
    if (activities.length === 0) {
      toast({
        title: 'No data',
        description: 'No activities to export',
        variant: 'destructive'
      });
      return;
    }

    const headers = ['Date', 'Action', 'Tool Name', 'Details', 'User'];
    const rows = activities.map(a => [
      new Date(a.timestamp).toLocaleString(),
      a.action,
      a.item_name,
      a.action === 'transferred' ? formatTransferDetails(a.details) : (a.details?.serial_number || ''),
      a.user_name
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tool_activity_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Success',
      description: 'Report exported successfully'
    });
  };

  if (loading) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading reports...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Tools</p>
                <p className="text-2xl font-bold text-gray-900">{summary.totalTools}</p>
              </div>
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Warehouse</p>
                <p className="text-2xl font-bold text-purple-600">{summary.warehouseTools}</p>
              </div>
              <Warehouse className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Vans</p>
                <p className="text-2xl font-bold text-blue-600">{summary.truckTools}</p>
              </div>
              <Truck className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Added (Month)</p>
                <p className="text-2xl font-bold text-green-600">{summary.addedThisMonth}</p>
              </div>
              <Plus className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Deleted (Month)</p>
                <p className="text-2xl font-bold text-red-600">{summary.deletedThisMonth}</p>
              </div>
              <Trash2 className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Transfers (Month)</p>
                <p className="text-2xl font-bold text-blue-600">{summary.transfersThisMonth}</p>
              </div>
              <ArrowRightLeft className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity History */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Tool Activity History
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <Label htmlFor="action-filter">Action Type</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="added">Added</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date-from">From Date</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date-to">To Date</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={applyFilters} className="flex-1">
                <Filter className="h-4 w-4 mr-2" />
                Apply
              </Button>
              <Button variant="outline" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>

          {/* Activity Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Tool Name</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No activity logs found for the selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">
                            {new Date(activity.timestamp).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(activity.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getActionIcon(activity.action)}
                          {getActionBadge(activity.action)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{activity.item_name}</TableCell>
                      <TableCell>
                        {activity.action === 'transferred' ? (
                          <span className="text-sm text-gray-600">
                            {formatTransferDetails(activity.details)}
                          </span>
                        ) : activity.details?.serial_number ? (
                          <span className="text-sm font-mono text-gray-600">
                            SN: {activity.details.serial_number}
                          </span>
                        ) : activity.details?.condition ? (
                          <span className="text-sm text-gray-600">
                            Condition: {activity.details.condition}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{activity.user_name}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {activities.length > 0 && (
            <p className="text-sm text-gray-500 text-center">
              Showing {activities.length} activities
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};