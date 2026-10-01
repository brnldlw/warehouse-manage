import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { loadVans } from '@/lib/vans';
import { truckLabel } from '@/lib/inventoryReport';
import { ConditionChange, MoveResult, moveTools } from '@/lib/toolMoves';

/** One tool in the confirmation list. */
export interface BulkTool { id: string; name: string; serial: string; barcode: string; condition: string }
export type BulkMode = 'return' | 'move';

type Van = Awaited<ReturnType<typeof loadVans>>[number];

const CONDITIONS: { value: ConditionChange; label: string }[] = [
  { value: 'keep', label: 'Keep as is' },
  { value: 'good', label: 'Good' },
  { value: 'damaged', label: 'Needs repair' },
];
const conditionText = (c: string) => (c === 'damaged' ? 'Needs repair / damaged' : c ? c[0].toUpperCase() + c.slice(1) : '—');

interface Props {
  mode: BulkMode;
  tools: BulkTool[];
  companyId: string | undefined;
  userId: string | undefined;
  /** The van they're on now (left out of the "move to" list). */
  fromTruckId?: string | null;
  /** e.g. "Van 3 (Sam Smith)". */
  fromLabel: string;
  /** Extra details saved on each history entry. */
  extraDetails?: Record<string, unknown>;
  /** Overrides the main button, e.g. "Return 12 tools and deactivate". */
  confirmLabel?: string;
  onClose: () => void;
  /** Called once the moves are done (also when some failed). */
  onFinished: (result: MoveResult) => void;
}

/** "Return X tools from Van 3 (Sam) to the warehouse?" / "Move X tools to another van" confirmation. */
export const BulkMoveDialog: React.FC<Props> = ({
  mode, tools, companyId, userId, fromTruckId, fromLabel, extraDetails, confirmLabel, onClose, onFinished,
}) => {
  const [condition, setCondition] = useState<ConditionChange>('keep');
  const [note, setNote] = useState('');
  const [vans, setVans] = useState<Van[] | null>(null);
  const [vanError, setVanError] = useState('');
  const [toVanId, setToVanId] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<MoveResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'move' || !companyId) return;
    loadVans(companyId)
      .then((v) => setVans(v.filter((x) => x.id !== fromTruckId)))
      .catch((e) => setVanError(`Couldn't load the vans: ${e instanceof Error ? e.message : String(e)}`));
  }, [mode, companyId, fromTruckId]);

  const n = tools.length;
  const single = n === 1;
  const toVan = vans?.find((v) => v.id === toVanId);
  const failed = result?.failed ?? [];

  const title = mode === 'return'
    ? (single ? 'Return tool to the warehouse' : `Return ${n} tools to the warehouse`)
    : (single ? 'Move tool to another van' : `Move ${n} tools to another van`);
  const question = mode === 'return'
    ? (single ? `Return ${tools[0]?.name} from ${fromLabel} to the warehouse?` : `Return ${n} tools from ${fromLabel} to the warehouse?`)
    : (single ? `Move ${tools[0]?.name} from ${fromLabel} to which van?` : `Move ${n} tools from ${fromLabel} to which van?`);
  const action = confirmLabel ?? (mode === 'return' ? (single ? 'Return tool' : `Return ${n} tools`) : (single ? 'Move tool' : `Move ${n} tools`));

  const run = async () => {
    if (!companyId) return;
    if (mode === 'move' && !toVan) { setError('Choose the van to move them to.'); return; }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await moveTools(
        companyId, userId, tools.map((t) => t.id),
        mode === 'return' ? { type: 'warehouse' } : { type: 'truck', truckId: toVan!.id, truckName: toVan!.name },
        { condition, note, extraDetails },
        (done, total) => setProgress({ done, total }),
      );
      setResult(r);
      onFinished(r);
    } catch (e) {
      // Nothing was moved: the tools couldn't even be read.
      setError(`Nothing was moved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => { if (busy) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-base text-gray-800">{question}</DialogDescription>
        </DialogHeader>

        {failed.length > 0 && (
          <div role="alert" className="rounded-md border-2 border-red-700 bg-red-50 p-3 text-red-950">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-5 w-5" />
              {result!.moved.length} moved, {failed.length} NOT moved. They are still selected so you can try again.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
              {failed.map((f) => <li key={f.id}><strong>{f.name}</strong>: {f.reason}</li>)}
            </ul>
          </div>
        )}
        {result?.historyWarning && <p className="rounded-md border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">{result.historyWarning}</p>}

        {mode === 'move' && !result && (
          <div className="space-y-2">
            <Label htmlFor="bulk-move-van" className="text-base font-semibold">Move to van</Label>
            {vanError ? <p className="text-sm text-red-700">{vanError}</p> : !vans ? (
              <p className="flex items-center gap-2 text-gray-700"><Loader2 className="h-4 w-4 animate-spin" /> Loading vans…</p>
            ) : vans.length === 0 ? (
              <p className="text-gray-700">There are no other vans in your company.</p>
            ) : (
              <Select value={toVanId} onValueChange={(v) => { setToVanId(v); setError(''); }} disabled={busy}>
                <SelectTrigger id="bulk-move-van" className="h-14 border-2 border-gray-800 text-base">
                  <SelectValue placeholder="Choose a van" />
                </SelectTrigger>
                <SelectContent>
                  {vans.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="min-h-[48px] text-base">
                      {truckLabel(v)} · {v.techs.length ? v.techs.join(', ') : 'no driver'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {!result && (
          <>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr><th className="p-2">Tool</th><th className="p-2">Serial / barcode</th><th className="p-2">Condition</th></tr>
                </thead>
                <tbody>
                  {tools.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2 font-medium">{t.name}</td>
                      <td className="p-2 font-mono">{[t.serial, t.barcode].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="p-2">{conditionText(t.condition)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <fieldset className="space-y-2" disabled={busy}>
              <legend className="text-base font-semibold">Condition (optional)</legend>
              <div className="grid grid-cols-3 overflow-hidden rounded-md border-2 border-gray-800" role="radiogroup">
                {CONDITIONS.map((c) => (
                  <button key={c.value} type="button" role="radio" aria-checked={condition === c.value} onClick={() => setCondition(c.value)}
                    className={`min-h-[56px] px-2 text-base font-medium ${condition === c.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {condition !== 'keep' && <p className="text-sm text-gray-700">Every tool above will be marked {condition === 'good' ? '"Good"' : '"Damaged" (needs repair)'}.</p>}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="bulk-move-note" className="text-base font-semibold">Note (optional)</Label>
              <Textarea id="bulk-move-note" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} rows={2}
                placeholder="e.g. Tech left the company" className="border-2 border-gray-800 text-base" />
              <p className="text-sm text-gray-700">Saved in each tool's history.</p>
            </div>
          </>
        )}

        {busy && (
          <div className="space-y-1" aria-live="polite">
            <div className="h-3 overflow-hidden rounded bg-gray-200">
              <div className="h-full bg-blue-700 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
            </div>
            <p className="text-sm text-gray-800">Working… {progress.done} of {progress.total || n} done. Please keep this window open.</p>
          </div>
        )}
        {error && <p role="alert" className="rounded-md border-2 border-red-700 bg-red-50 p-3 text-red-950">{error}</p>}

        <DialogFooter>
          {result ? (
            <Button className="h-14 px-6 text-base" onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" className="h-14 border-2 px-6 text-base" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button className="h-14 bg-blue-700 px-6 text-base text-white hover:bg-blue-800" onClick={run}
                disabled={busy || !companyId || (mode === 'move' && !toVan)}>
                {busy && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {action}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
