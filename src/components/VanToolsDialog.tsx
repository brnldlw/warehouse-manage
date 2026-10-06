import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronUp, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Printer, Truck } from 'lucide-react';
import { BulkMoveControls, BulkTool } from '@/components/moves/BulkMoveControls';
import { SelectBox } from '@/components/moves/SelectBox';
import { triState } from '@/lib/selection';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePrint } from '@/hooks/use-print';
import { SearchBox } from '@/components/SearchBox';
import { PrintPortal } from '@/components/print/PrintPortal';
import { VanToolSheets } from '@/components/print/VanToolSheets';
import { matchesSearch } from '@/lib/search';
import { usePoSupport } from '@/lib/poSupport';
import { useColorSupport } from '@/lib/toolColor';
import { ColorDot } from '@/components/ColorDot';
import {
  Detail, ReportItem, conditionLabel, exportColumnKeys, ReportMeta, TruckInfo, buildRows, cellText, downloadCsv, downloadXlsx,
  exportFileName, formatDateTime, formatMoney, groupRows, loadCompanyName, loadVanItems, sortRows, truckLabel,
} from '@/lib/inventoryReport';

interface VanToolsDialogProps {
  /** The van to show; null closes the dialog. */
  truck: TruckInfo | null;
  /** People assigned to this van, for the header and the printed sheet. */
  techNames?: string[];
  /** Optional heading, e.g. "Sam Smith's van". */
  heading?: string;
  onClose: () => void;
  /** Called after tools were returned or moved, e.g. to refresh tool counts. */
  onToolsChanged?: () => void;
}

/** Just the tools on one van: search, totals, select & return/move, printable checklist, CSV/Excel. */
export const VanToolsDialog: React.FC<VanToolsDialogProps> = ({ truck, techNames = [], heading, onClose, onToolsChanged }) => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const { printing, print } = usePrint();
  const poSupported = usePoSupport();
  // Every row is on this van, so no location column; PO columns once the database has them.
  const colorSupported = useColorSupport();
  const EXPORT_COLUMNS = exportColumnKeys(poSupported, colorSupported).filter((k) => k !== 'location');
  const [items, setItems] = useState<ReportItem[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Detail>('summary');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const companyId = userProfile?.company_id;
  const truckId = truck?.id;

  const reload = async () => {
    if (!truck || !companyId) return;
    try {
      setItems(await loadVanItems(companyId, truck));
    } catch (err) {
      console.error('Error reloading van tools:', err);
      toast({ title: 'Error', description: "Couldn't refresh this van's tools. Close and reopen to see the latest.", variant: 'destructive' });
    }
    onToolsChanged?.();
  };

  useEffect(() => {
    if (!truck || !companyId) return;
    let cancelled = false;
    setLoading(true);
    setSearch('');
    setItems([]);
    setSelected(new Set());
    setExpanded(new Set());
    Promise.all([loadVanItems(companyId, truck), loadCompanyName(companyId)])
      .then(([vanItems, name]) => { if (!cancelled) { setItems(vanItems); setCompanyName(name); } })
      .catch((err) => {
        console.error('Error loading van tools:', err);
        toast({ title: 'Error', description: "Couldn't load this van's tools.", variant: 'destructive' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckId, companyId]);

  const allRows = useMemo(() => sortRows(buildRows(items, detail), 'name'), [items, detail]);
  const shownRows = useMemo(
    () => allRows.filter((r) => matchesSearch(search, r.name, r.category, r.serial, r.barcode, r.poNumber, r.condition, r.color)),
    [allRows, search],
  );
  const toolCount = (rows: typeof allRows) => rows.reduce((n, r) => n + r.quantity, 0);
  const toolValue = (rows: typeof allRows) => rows.reduce((n, r) => n + (r.totalValue ?? 0), 0);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const shownIds = useMemo(() => shownRows.flatMap((r) => r.itemIds), [shownRows]);

  const setSome = (ids: string[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  });
  const toggleExpanded = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectedTools: BulkTool[] = items.filter((i) => selected.has(i.id))
    .map((i) => ({ id: i.id, name: i.name, serial: i.serial, barcode: i.barcode, condition: i.condition }));

  if (!truck) return null;

  const label = truckLabel(truck);
  const fromLabel = techNames.length ? `${truck.name} (${techNames.join(', ')})` : truck.name;
  const colCount = (poSupported ? 10 : 9) + 1;
  const printedBy = [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ') || userProfile?.email || '';
  const meta: ReportMeta = { companyName, title: 'Van Tool Sheet', filtersText: '', printedBy, printedAt: new Date() };
  const fileBase = `van-${truck.name}`;
  // Printing and downloads always cover every tool on the van, not just search results.
  const allGroups = groupRows(allRows, 'none');

  const bigButton = 'h-14 px-5 text-base font-semibold';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Truck className="h-5 w-5" /> {heading ?? label}
          </DialogTitle>
          <DialogDescription className="text-base text-gray-700">
            {heading ? `${label} · ` : ''}
            {techNames.length ? `Assigned: ${techNames.join(', ')}` : 'No technician assigned'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-gray-700">
            <Loader2 className="h-6 w-6 animate-spin" /> Loading tools…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-base">
              <span><strong>{toolCount(allRows)}</strong> tools on this van</span>
              <span>Total value <strong>{formatMoney(toolValue(allRows))}</strong></span>
            </div>

            <p className="text-sm text-gray-700">Print and downloads (buttons at the bottom) always include every tool on the van, even when you are searching.</p>

            <div className="flex flex-col md:flex-row md:items-start gap-3">
              <SearchBox
                className="flex-1"
                value={search}
                onChange={setSearch}
                placeholder="Search this van: name, category, serial, barcode, PO…"
                shown={toolCount(shownRows)}
                total={toolCount(allRows)}
                noun="tools"
              />
              <div className="flex rounded-md border-2 border-gray-800 overflow-hidden shrink-0" role="group" aria-label="Detail level">
                {(['summary', 'detailed'] as Detail[]).map((d) => (
                  <button key={d} type="button" onClick={() => setDetail(d)}
                    className={`h-12 px-4 text-base font-medium ${detail === d ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
                    {d === 'summary' ? 'Grouped' : 'Each tool'}
                  </button>
                ))}
              </div>
            </div>

            <div className="sticky top-0 z-10 space-y-3 bg-background empty:hidden">
              <BulkMoveControls
                companyId={companyId}
                userId={userProfile?.id}
                selected={selectedTools}
                fromTruckId={truck.id}
                fromLabel={fromLabel}
                onSelectionChange={(ids) => setSelected(new Set(ids))}
                onChanged={reload}
              />
            </div>

            {items.length === 0 ? (
              <p className="py-10 text-center text-base text-gray-700">No tools are on this van.</p>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 px-0">
                        <SelectBox label="Select all tools shown" checked={shownIds.length ? triState(shownIds, selected) : false}
                          disabled={!shownIds.length} onChange={(on) => setSome(shownIds, on)} />
                      </TableHead>
                      <TableHead className="w-14">Photo</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Serial #</TableHead>
                      <TableHead>Barcode</TableHead>
                      {poSupported && <TableHead>PO #</TableHead>}
                      <TableHead>Condition</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Unit value</TableHead>
                      <TableHead className="text-right">Total value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shownRows.length === 0 ? (
                      <TableRow><TableCell colSpan={colCount} className="py-8 text-center text-gray-700">No tools match your search.</TableCell></TableRow>
                    ) : shownRows.map((r) => {
                      const isOpen = expanded.has(r.key) && r.itemIds.length > 1;
                      return (
                      <React.Fragment key={r.key}>
                      <TableRow data-state={triState(r.itemIds, selected) === true ? 'selected' : undefined}>
                        <TableCell className="px-0">
                          <SelectBox label={`Select ${r.name}${r.itemIds.length > 1 ? ` (all ${r.itemIds.length})` : ''}`}
                            checked={triState(r.itemIds, selected)} onChange={(on) => setSome(r.itemIds, on)} />
                        </TableCell>
                        <TableCell>
                          <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                            {r.imageUrl ? <img src={r.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-gray-400" />}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.itemIds.length > 1 ? (
                            <button type="button" onClick={() => toggleExpanded(r.key)} aria-expanded={isOpen}
                              className="flex min-h-[44px] items-center gap-1 text-left font-medium">
                              {isOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                              <ColorDot color={r.colorValue} className="mr-1" />
                              {r.name}
                              <span className="ml-1 whitespace-nowrap text-sm font-normal text-blue-800 underline">{isOpen ? 'hide units' : 'show units'}</span>
                            </button>
                          ) : <span className="flex items-center gap-2"><ColorDot color={r.colorValue} />{r.name}</span>}
                        </TableCell>
                        <TableCell>{r.category}</TableCell>
                        <TableCell className="font-mono text-sm">{r.serial}</TableCell>
                        <TableCell className="font-mono text-sm">{r.barcode}</TableCell>
                        {poSupported && <TableCell className="text-sm">{r.poNumber}</TableCell>}
                        <TableCell>{r.condition}</TableCell>
                        <TableCell className="text-right">{r.quantity}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{cellText(r, 'unitValue')}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{cellText(r, 'totalValue')}</TableCell>
                      </TableRow>
                      {isOpen && r.itemIds.map((id, idx) => {
                        const u = itemById.get(id);
                        if (!u) return null;
                        return (
                          <TableRow key={id} className="bg-gray-50" data-state={selected.has(id) ? 'selected' : undefined}>
                            <TableCell className="px-0 pl-4">
                              <SelectBox label={`Select ${u.name} #${idx + 1}`} checked={selected.has(id)} onChange={(on) => setSome([id], on)} />
                            </TableCell>
                            <TableCell className="text-sm text-gray-600 text-center">#{idx + 1}</TableCell>
                            <TableCell className="pl-8 text-sm"><span className="flex items-center gap-2"><ColorDot color={u.color} />{u.name}</span></TableCell>
                            <TableCell />
                            <TableCell className="font-mono text-sm">{u.serial}</TableCell>
                            <TableCell className="font-mono text-sm">{u.barcode}</TableCell>
                            {poSupported && <TableCell className="text-sm">{u.poNumber}</TableCell>}
                            <TableCell className="text-sm">{conditionLabel(u.condition)}</TableCell>
                            <TableCell className="text-right">1</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{u.unitPrice != null ? formatMoney(u.unitPrice) : ''}</TableCell>
                            <TableCell />
                          </TableRow>
                        );
                      })}
                      </React.Fragment>
                      );
                    })}
                    {shownRows.length > 0 && (
                      <TableRow className="font-bold border-t-2 border-gray-800">
                        <TableCell colSpan={poSupported ? 8 : 7}>{search ? 'Total (search results)' : 'Total'}</TableCell>
                        <TableCell className="text-right">{toolCount(shownRows)}</TableCell>
                        <TableCell />
                        <TableCell className="text-right whitespace-nowrap">{formatMoney(toolValue(shownRows))}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            <DialogFooter className="grid grid-cols-3 sm:flex">
              <Button variant="outline" className={`${bigButton} border-2 border-gray-800 px-2 sm:px-5`} disabled={!items.length}
                onClick={() => downloadCsv(exportFileName(companyName, fileBase, 'csv'), EXPORT_COLUMNS, allGroups, 'none')}>
                <FileText className="h-5 w-5 sm:mr-2" /> <span className="sm:hidden">CSV</span><span className="hidden sm:inline">Download CSV</span>
              </Button>
              <Button variant="outline" className={`${bigButton} border-2 border-gray-800 px-2 sm:px-5`} disabled={!items.length}
                onClick={() => downloadXlsx(exportFileName(companyName, fileBase, 'xlsx'),
                  { ...meta, title: `Tools on ${label}`, printedAt: new Date() }, EXPORT_COLUMNS, allGroups, 'none')}>
                <FileSpreadsheet className="h-5 w-5 sm:mr-2" /> <span className="sm:hidden">Excel</span><span className="hidden sm:inline">Download Excel</span>
              </Button>
              <Button className={`${bigButton} bg-blue-700 hover:bg-blue-800 text-white px-2 sm:px-5`} onClick={print} disabled={!items.length}>
                <Printer className="h-5 w-5 sm:mr-2" /> <span className="sm:hidden">Print</span><span className="hidden sm:inline">Print checklist</span>
              </Button>
            </DialogFooter>
          </div>
        )}

        {printing && (
          <PrintPortal runningHeader={`${companyName} — Van Tool Sheet`} runningHeaderRight={`Printed ${formatDateTime(meta.printedAt)}`}>
            <VanToolSheets meta={meta} vans={[{ id: truck.id, label, techs: techNames, rows: sortRows(buildRows(items, detail), 'name') }]} />
          </PrintPortal>
        )}
      </DialogContent>
    </Dialog>
  );
};
