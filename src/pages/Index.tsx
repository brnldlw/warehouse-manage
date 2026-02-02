import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AdminPanel from '@/components/AdminPanel';
import { TechPanel } from '@/components/TechPanel';
import { UserHeader } from '@/components/UserHeader';
import { InventoryProvider } from '@/contexts/InventoryContext';

const Index: React.FC = () => {
  const { userProfile, loading, isAdmin, isTech } = useAuth();

  // Show loading state until we have both user data and role information
  if (loading || !userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UserHeader />
      <InventoryProvider>
        <div className="p-4">
          {isTech ? <TechPanel /> : <AdminPanel />}
        </div>
      </InventoryProvider>
    </div>
  );
};

export default Index;