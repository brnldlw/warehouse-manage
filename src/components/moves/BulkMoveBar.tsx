import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, Truck, Warehouse } from 'lucide-react';

/**
 * "X selected · Clear" with the move buttons. On a van: Return to warehouse / Move to another
 * van. In a warehouse: Move to another warehouse / Send to a van.
 */
export const BulkMoveBar: React.FC<{
  count: number;
  /** Where the selected tools are now. */
  fromKind?: 'van' | 'warehouse';
  onClear: () => void;
  /** Van: return to warehouse. Warehouse: move to another warehouse. */
  onReturn: () => void;
  /** Send to a (different) van. */
  onMove: () => void;
  /** Extra buttons, e.g. "Set PO number" on Manage Parts. */
  children?: React.ReactNode;
}> = ({ count, fromKind = 'van', onClear, onReturn, onMove, children }) => (
  <div className="flex flex-col gap-3 rounded-md border-2 border-blue-700 bg-blue-50 p-3 sm:flex-row sm:flex-wrap sm:items-center" role="region" aria-label="Selected tools">
    <span className="text-base font-semibold">
      {count} selected
      <button type="button" onClick={onClear} className="ml-3 min-h-[44px] px-1 text-base font-medium text-blue-800 underline underline-offset-2">
        Clear
      </button>
    </span>
    <div className="flex flex-wrap gap-2">
      <Button className="h-14 bg-blue-700 text-white hover:bg-blue-800" onClick={onReturn}>
        <Warehouse className="mr-2 h-5 w-5" /> {fromKind === 'warehouse' ? 'Move to another warehouse' : 'Return to warehouse'}
      </Button>
      <Button variant="outline" className="h-14 border-2 border-gray-800" onClick={onMove}>
        {fromKind === 'warehouse' ? <Truck className="mr-2 h-5 w-5" /> : <ArrowRightLeft className="mr-2 h-5 w-5" />}
        {fromKind === 'warehouse' ? 'Send to a van' : 'Move to another van'}
      </Button>
      {children}
    </div>
  </div>
);
