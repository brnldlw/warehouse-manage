import React, { useState } from 'react';
import { InventoryProvider } from '@/contexts/InventoryContext';
import { UserHeader } from '@/components/UserHeader';
import AdminPanel from './AdminPanel';
import MobileApp from './MobileApp';
import ViewToggle from './ViewToggle';
import { ViewMode } from '@/types/inventory';

const AppLayout: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>('admin');

  return (
    <InventoryProvider>
      <div className="min-h-screen bg-gray-50">
        <UserHeader />
        <div className="p-4">
          <ViewToggle currentView={currentView} onViewChange={setCurrentView} />
          {currentView === 'admin' ? <AdminPanel /> : <MobileApp />}
        </div>
      </div>
    </InventoryProvider>
  );
};

export default AppLayout;