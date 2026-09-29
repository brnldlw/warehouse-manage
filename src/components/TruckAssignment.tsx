import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Truck, TruckAssignment } from '@/types/truck';
import { dbOperations } from '@/lib/dbUtils';
import { showErrorNotification, showSuccessNotification } from '@/lib/notificationUtils';
import { useToast } from '@/hooks/use-toast';
import { UserCheck, Truck as TruckIcon, Loader2 } from 'lucide-react';
import { SearchBox } from '@/components/SearchBox';
import { matchesSearch } from '@/lib/search';
export const TruckAssignmentManager: React.FC = () => {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<TruckAssignment[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedTruck, setSelectedTruck] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setPageLoading(true);
    try {
      const [trucks, users, assignments] = await Promise.all([
        dbOperations.getTrucks(),
        dbOperations.getUserProfiles(),
        dbOperations.getUserTruckAssignments()
      ]);

      setTrucks([...(trucks || [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        || (a.identifier ?? '').localeCompare(b.identifier ?? '', undefined, { numeric: true })));
      setUsers(users || []);
      setAssignments(assignments || []);
    } catch (error) {
      showErrorNotification(error, 'Failed to load data');
    } finally {
      setPageLoading(false);
    }
  };

  const assignUserToTruck = async () => {
    if (!selectedUser || !selectedTruck) return;

    setLoading(true);
    try {
      await dbOperations.addUserTruckAssignment({
        user_id: selectedUser,
        truck_id: selectedTruck
      });

      await loadData();
      setSelectedUser('');
      setSelectedTruck('');
      
      showSuccessNotification('User assigned to truck successfully');
    } catch (error) {
      showErrorNotification(error, 'Failed to assign user to truck');
    }
    setLoading(false);
  };

  const removeAssignment = async (assignmentId: string) => {
    try {
      await dbOperations.removeUserTruckAssignment(assignmentId);
      
      await loadData();
      showSuccessNotification('Assignment removed successfully');
    } catch (error) {
      showErrorNotification(error, 'Failed to remove assignment');
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email : 'Unknown User';
  };

  const getTruckName = (truckId: string) => {
    const truck = trucks.find(t => t.id === truckId);
    return truck ? truck.name : 'Unknown Truck';
  };

  const visibleAssignments = assignments.filter((a) => {
    const user = users.find((u) => u.id === a.user_id);
    const truck = trucks.find((t) => t.id === a.truck_id);
    return matchesSearch(search, getUserName(a.user_id), user?.first_name, user?.last_name, user?.email, user?.phone,
      truck?.name, truck?.identifier);
  });

  return (
    <div className="space-y-6">
      {pageLoading ? (
        <Card className="text-center py-12">
          <CardContent>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading assignments...</p>
          </CardContent>
        </Card>
      ) : (
        <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Assign User to Truck/Van
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Select User" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {getUserName(user.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={selectedTruck} onValueChange={setSelectedTruck}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Truck/Van" />
                </SelectTrigger>
                <SelectContent>
                  {trucks.map((truck) => (
                    <SelectItem key={truck.id} value={truck.id}>
                      {truck.name} ({truck.identifier})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button 
            onClick={assignUserToTruck} 
            disabled={loading || !selectedUser || !selectedTruck}
            className="w-full"
          >
            Assign User to Truck/Van
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by technician, email, phone or van…"
            shown={visibleAssignments.length}
            total={assignments.length}
            noun="assignments"
          />
          <div className="space-y-2">
            {visibleAssignments.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <TruckIcon className="h-4 w-4" />
                  <div>
                    <p className="font-medium">{getUserName(assignment.user_id)}</p>
                    <p className="text-sm text-muted-foreground">
                      {getTruckName(assignment.truck_id)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeAssignment(assignment.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
            {visibleAssignments.length === 0 && (
              <p className="text-muted-foreground text-center py-4">
                {search && assignments.length ? 'No assignments match your search' : 'No assignments yet'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
};