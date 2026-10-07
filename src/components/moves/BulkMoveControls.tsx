import React, { useCallback, useState } from 'react';
import { BulkMoveBar } from './BulkMoveBar';
import { BulkMode, BulkMoveDialog, BulkTool } from './BulkMoveDialog';
import { UndoBanner } from './UndoBanner';
import { MoveResult, undoMove } from '@/lib/toolMoves';

export type { BulkTool } from './BulkMoveDialog';

/**
 * Everything for "select tools → Return to warehouse / Move to another van → Undo".
 * Used by the van/tech tool view and by Manage Parts (when it's filtered to a van).
 */
export const BulkMoveControls: React.FC<{
  companyId: string | undefined;
  userId: string | undefined;
  /** The selected tools. */
  selected: BulkTool[];
  /** The van they're on, if known. */
  fromTruckId?: string | null;
  /** Set when the list is a warehouse instead of a van. */
  fromWarehouseId?: string | null;
  /** e.g. "Van 3 (Sam Smith)". */
  fromLabel: string;
  /** Replace the selection (failed tools stay selected; moved ones are dropped). */
  onSelectionChange: (ids: string[]) => void;
  /** Reload the list after a move or an undo. */
  onChanged: () => void | Promise<void>;
  /** Extra buttons for the action bar. */
  children?: React.ReactNode;
}> = ({ companyId, userId, selected, fromTruckId, fromWarehouseId, fromLabel, onSelectionChange, onChanged, children }) => {
  const inWarehouse = !!fromWarehouseId;
  const [mode, setMode] = useState<BulkMode | null>(null);
  const [dialogTools, setDialogTools] = useState<BulkTool[]>([]);
  const [lastMove, setLastMove] = useState<MoveResult | null>(null);

  const open = (m: BulkMode) => { setDialogTools(selected); setMode(m); };

  const finished = (r: MoveResult) => {
    onSelectionChange(r.failed.map((f) => f.id));
    if (r.moved.length) setLastMove(r);
    if (!r.failed.length && !r.historyWarning) setMode(null);
    onChanged();
  };

  const undo = async () => {
    if (!companyId || !lastMove) return { restored: 0, failed: [] };
    const r = await undoMove(companyId, userId, lastMove);
    await onChanged();
    return r;
  };
  const dismiss = useCallback(() => setLastMove(null), []);

  return (
    <>
      {lastMove && <UndoBanner move={lastMove} onUndo={undo} onDismiss={dismiss} />}
      {selected.length > 0 && (
        <BulkMoveBar count={selected.length} fromKind={inWarehouse ? 'warehouse' : 'van'} onClear={() => onSelectionChange([])}
          onReturn={() => open(inWarehouse ? 'warehouse' : 'return')} onMove={() => open('move')}>
          {children}
        </BulkMoveBar>
      )}
      {mode && (
        <BulkMoveDialog
          mode={mode}
          tools={dialogTools}
          companyId={companyId}
          userId={userId}
          fromTruckId={fromTruckId}
          fromWarehouseId={fromWarehouseId}
          fromLabel={fromLabel}
          onClose={() => setMode(null)}
          onFinished={finished}
        />
      )}
    </>
  );
};
