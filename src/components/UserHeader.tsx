import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User } from 'lucide-react';

export const UserHeader: React.FC = () => {
  const { user, userProfile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="bg-white shadow-sm border-b px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <User className="h-8 w-8 text-gray-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Inventory Tracker
              {userProfile?.role && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  {userProfile.role.toUpperCase()}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500">
              Welcome, {userProfile?.first_name || user?.email}
            </p>
          </div>
        </div>
        <Button 
          onClick={handleSignOut} 
          variant="destructive" 
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </div>
  );
};