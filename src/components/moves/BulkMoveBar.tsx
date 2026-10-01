import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, Warehouse } from 'lucide-react';

/** "X selected · Clear" with Return to warehouse / Move to another van. */
export const BulkMoveBar: React.FC<{
  count: number;
  onClear: () => void;
  onReturn: () => void;
  onMove: () => void;
  /** Extra buttons, e.g. "Set PO number" on Manage Parts. */
  children?: React.ReactNode;
}> = ({ count, onClear, onReturn, onMove, children }) => (
  <div className="flex flex-col gap-3 rounded-md border-2 border-blue-700 bg-blue-50 p-3 sm:flex-row sm:flex-wrap sm:items-center" role="region" aria-label="Selected tools">
    <span className="text-base font-semibold">
      {count} selected
      <button type="button" onClick={onClear} className="ml-3 min-h-[44px] px-1 text-base font-medium text-blue-800 underline underline-offset-2">
        Clear
      </button>
    </span>
    <div className="flex flex-wrap gap-2">
      <Button className="h-14 bg-blue-700 text-white hover:bg-blue-800" onClick={onReturn}>
        <Warehouse className="mr-2 h-5 w-5" /> Return to warehouse
      </Button>
      <Button variant="outline" className="h-14 border-2 border-gray-800" onClick={onMove}>
        <ArrowRightLeft className="mr-2 h-5 w-5" /> Move to another van
      </Button>
      {children}
    </div>
  </div>
);
