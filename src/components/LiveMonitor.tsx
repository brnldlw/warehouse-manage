import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Users, TrendingUp, Clock } from 'lucide-react';
import { useInventory } from '@/contexts/InventoryContext';

const LiveMonitor: React.FC = () => {
  const { activities, users, items } = useInventory();

  const recentActivities = activities.slice(0, 10);
  const lowStockItems = items.filter(item => item.quantity <= item.minQuantity);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'ADD_ITEM': return 'bg-green-100 text-green-800';
      case 'UPDATE_ITEM': return 'bg-blue-100 text-blue-800';
      case 'DELETE_ITEM': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUserName = (userId: string) => {
    return users.find(user => user.id === userId)?.name || 'Unknown User';
  };

  return (
    <div className="space-y-6">
      {/* Real-time Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100">Active Users</p>
                <p className="text-3xl font-bold">{users.filter(u => u.role === 'user').length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100">Total Activities</p>
                <p className="text-3xl font-bold">{activities.length}</p>
              </div>
              <Activity className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100">Low Stock Alerts</p>
                <p className="text-3xl font-bold">{lowStockItems.length}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activities */}
        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.length > 0 ? (
                recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                    <div className="flex-shrink-0">
                      <Badge className={getActionColor(activity.action)}>
                        {activity.action.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {getUserName(activity.userId)}
                      </p>
                      <p className="text-sm text-gray-600">{activity.details}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-400">
                          {activity.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No recent activities</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lowStockItems.length > 0 ? (
                lowStockItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-600">{item.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-red-600">
                        {item.quantity} / {item.minQuantity}
                      </p>
                      <p className="text-xs text-gray-500">Current / Min</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">All items are well stocked</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LiveMonitor;