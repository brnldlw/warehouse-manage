import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRightLeft, Loader2, PackageCheck, Printer, Warehouse } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';
import { PrintPortal } from '@/components/print/PrintPortal';
import { VanToolSheets } from '@/components/print/VanToolSheets';
import {
  ReportItem, ReportMeta, TruckInfo, buildRows, formatDateTime, loadCompanyName, loadVanItems, sortRows, truckLabel,
} from '@/lib/inventoryReport';
import { MoveResult } from '@/lib/toolMoves';
import { BulkMode, BulkMoveDialog } from './BulkMoveDialog';

interface Props {
  techId: string;
  techName: string;
  truck: TruckInfo;
  /** Everyone assigned to the van (including this tech). */
  vanTechNames: string[];
  companyId: string | undefined;
  userId: string | undefined;
  printedBy: string;
  onCancel: () => void;
  /** Sets the tech inactive. Throws on failure. */
  onDeactivate: () => Promise<void>;
  /** Tools moved (even if deactivating then failed). */
  onToolsChanged: () => void;
}

/** "[Name] still has X tools on [Van]. What do you want to do?" before deactivating a tech. */
export const DeactivateTechDialog: React.FC<Props> = ({
  techId, techName, truck, vanTechNames, companyId, userId, printedBy, onCancel, onDeactivate, onToolsChanged,
}) => {
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [loadError, setLoadError] = useState('');
  const [sub, setSub] = useState<BulkMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { printing, print } = usePrint();

  useEffect(() => {
    if (!companyId) return;
    Promise.all([loadVanItems(companyId, truck), loadCompanyName(companyId)])
      .then(([v, name]) => { setItems(v); setCompanyName(name); })
      .catch((e) => setLoadError(`Couldn't load the van's tools: ${e instanceof Error ? e.message : String(e)}`));
  }, [companyId, truck]);

  const n = items?.length ?? 0;
  const others = vanTechNames.filter((x) => x !== techName);
  const label = truckLabel(truck);

  const deactivate = async () => {
    setBusy(true);
    setError('');
    try {
      await onDeactivate();
    } catch (e) {
      setError(`Couldn't deactivate ${techName}: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  const movedThenDeactivate = async (r: MoveResult) => {
    onToolsChanged();
    if (r.failed.length) {
      // BulkMoveDialog lists the failures; don't deactivate with tools in limbo.
      setError(`${techName} was NOT deactivated: ${r.failed.length} tool${r.failed.length === 1 ? '' : 's'} didn't move. Try again, or choose "Leave them on the van".`);
      return;
    }
    setSub(null);
    await deactivate();
  };

  if (sub && items) {
    return (
      <BulkMoveDialog
        mode={sub}
        tools={items.map((i) => ({ id: i.id, name: i.name, serial: i.serial, barcode: i.barcode, condition: i.condition }))}
        companyId={companyId}
        userId={userId}
        fromTruckId={truck.id}
        fromLabel={`${truck.name} (${techName})`}
        extraDetails={{ reason: 'tech_deactivated', tech_id: techId, tech_name: techName }}
        confirmLabel={`${sub === 'return' ? 'Return' : 'Move'} ${n} tool${n === 1 ? '' : 's'} and deactivate`}
        onClose={() => {
          setSub(null);
          // Some may have moved before a failure: show what's really left on the van.
          if (companyId) loadVanItems(companyId, truck).then(setItems).catch(() => undefined);
        }}
        onFinished={movedThenDeactivate}
      />
    );
  }

  const meta: ReportMeta = { companyName, title: 'Van Return Sheet', filtersText: `Returning tools from ${techName}`, printedBy, printedAt: new Date() };
  const big = 'h-auto min-h-[56px] justify-start whitespace-normal px-4 py-2 text-left text-base font-semibold';

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Deactivate {techName}</DialogTitle>
          <DialogDescription className="text-base text-gray-800">
            {items === null && !loadError ? 'Checking the van…'
              : n > 0 ? `${techName} still has ${n} tool${n === 1 ? '' : 's'} on ${label}. What do you want to do?`
              : `${label} has no tools on it now.`}
          </DialogDescription>
        </DialogHeader>

        {items === null && !loadError && <p className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading tools…</p>}
        {loadError && <p role="alert" className="rounded-md border-2 border-red-700 bg-red-50 p-3 text-red-950">{loadError}</p>}
        {others.length > 0 && n > 0 && (
          <p className="rounded-md border-2 border-amber-600 bg-amber-50 p-3 text-amber-950">
            This van is also assigned to {others.join(', ')}.
          </p>
        )}
        {error && (
          <p role="alert" className="flex gap-2 rounded-md border-2 border-red-700 bg-red-50 p-3 text-red-950">
            <AlertTriangle className="h-5 w-5 shrink-0" /> {error}
          </p>
        )}

        {items !== null && (
          <div className="grid gap-2">
            {n > 0 && (
              <>
                <Button className={`${big} bg-blue-700 text-white hover:bg-blue-800`} disabled={busy} onClick={() => setSub('return')}>
                  <Warehouse className="mr-3 h-5 w-5" /> Return all to warehouse
                </Button>
                <Button variant="outline" className={`${big} border-2 border-gray-800`} disabled={busy} onClick={() => setSub('move')}>
                  <ArrowRightLeft className="mr-3 h-5 w-5" /> Move all to another van
                </Button>
              </>
            )}
            <Button variant="outline" className={`${big} border-2 border-gray-800`} disabled={busy} onClick={deactivate}>
              {busy ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <PackageCheck className="mr-3 h-5 w-5" />}
              {n > 0 ? 'Leave them on the van and deactivate' : 'Deactivate'}
            </Button>
            {n > 0 && (
              <Button variant="outline" className={`${big} border-2`} disabled={busy} onClick={print}>
                <Printer className="mr-3 h-5 w-5" /> Print return sheet (check tools off as they come back)
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="h-14 border-2 px-6 text-base" onClick={onCancel} disabled={busy}>Cancel</Button>
        </DialogFooter>

        {printing && items && (
          <PrintPortal runningHeader={`${companyName} — Van Return Sheet`} runningHeaderRight={`Printed ${formatDateTime(meta.printedAt)}`}>
            <VanToolSheets meta={meta} vans={[{ id: truck.id, label, techs: vanTechNames, rows: sortRows(buildRows(items, 'detailed'), 'name') }]} />
          </PrintPortal>
        )}
      </DialogContent>
    </Dialog>
  );
};
