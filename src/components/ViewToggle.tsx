import React from 'react';
import { Button } from '@/components/ui/button';
import { Monitor, Smartphone } from 'lucide-react';
import { ViewMode } from '@/types/inventory';

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ currentView, onViewChange }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex gap-2 bg-white rounded-lg shadow-lg p-2">
      <Button
        variant={currentView === 'admin' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onViewChange('admin')}
        className="flex items-center gap-2"
      >
        <Monitor className="h-4 w-4" />
        Admin
      </Button>
      <Button
        variant={currentView === 'mobile' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onViewChange('mobile')}
        className="flex items-center gap-2"
      >
        <Smartphone className="h-4 w-4" />
        Mobile
      </Button>
    </div>
  );
};

export default ViewToggle;