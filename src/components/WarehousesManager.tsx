import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil, Plus, Power, Warehouse as WarehouseIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { formatMoney } from '@/lib/inventoryReport';
import { FormAlert } from '@/components/auth/FormAlert';
import {
  Warehouse, createWarehouse, moveWarehouseContents, updateWarehouse, useWarehouses,
} from '@/lib/warehouses';

interface Stats { home: number; inside: number; onVans: number; value: number; unpriced: number }
const EMPTY: Stats = { home: 0, inside: 0, onVans: 0, value: 0, unpriced: 0 };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Admins: the company's warehouses, with tool counts and value; add, edit, deactivate. */
export const WarehousesManager: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const { toast } = useToast();
  const companyId = userProfile?.company_id;
  const wh = useWarehouses(companyId);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<Warehouse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!companyId || !wh.supported) return;
    setLoadingStats(true);
    try {
      const tools = await fetchAll<Record<string, unknown>>(() => supabase.from('inventory_items')
        .select('id, unit_price, location_type, home_warehouse_id, current_warehouse_id')
        .eq('company_id', companyId).order('id').returns<Record<string, unknown>[]>());
      const s: Record<string, Stats> = {};
      const get = (id: string) => (s[id] ??= { ...EMPTY });
      for (const t of tools) {
        const home = t.home_warehouse_id as string | null;
        const cur = t.current_warehouse_id as string | null;
        if (home) {
          const h = get(home);
          h.home++;
          if (t.location_type === 'truck') h.onVans++;
          const price = t.unit_price === null || t.unit_price === undefined ? NaN : Number(t.unit_price);
          if (Number.isFinite(price)) h.value += price; else h.unpriced++;
        }
        if (cur && t.location_type !== 'truck') get(cur).inside++;
      }
      setStats(s);
    } catch (err) {
      toast({ title: 'Error', description: `Couldn't count tools: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
    } finally {
      setLoadingStats(false);
    }
  }, [companyId, wh.supported, toast]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const refresh = async () => { await wh.reload(); await loadStats(); };

  const reactivate = async (w: Warehouse) => {
    if (!companyId) return;
    setBusyId(w.id);
    try {
      await updateWarehouse(companyId, userProfile?.id, w, { is_active: true });
      toast({ title: 'Warehouse reactivated', description: `${w.name} can be used again.` });
      await refresh();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (wh.supported === null) {
    return <div className="flex items-center gap-3 py-16 text-gray-700"><Loader2 className="h-6 w-6 animate-spin" /> Loading warehouses…</div>;
  }
  if (!wh.supported) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><WarehouseIcon className="h-5 w-5" /> Warehouses</CardTitle></CardHeader>
        <CardContent>
          <p className="text-base text-gray-800">Multiple warehouses aren't switched on in the database yet. An admin needs to run the 006_warehouses.sql update in Supabase. Everything else works as normal.</p>
        </CardContent>
      </Card>
    );
  }

  const totals = Object.values(stats).reduce((a, s) => ({ home: a.home + s.home, value: a.value + s.value }), { home: 0, value: 0 });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2"><WarehouseIcon className="h-5 w-5" /> Warehouses</CardTitle>
            {isAdmin && (
              <Button className="h-14 bg-blue-700 px-5 text-base font-semibold text-white hover:bg-blue-800" onClick={() => setEditing('new')}>
                <Plus className="mr-2 h-5 w-5" /> Add warehouse
              </Button>
            )}
          </div>
          <p className="text-base text-gray-700">
            Every tool has a home warehouse: where it belongs, even while it's out on a van. "In it now" counts tools physically in the warehouse.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Tools (home)</TableHead>
                  <TableHead className="text-right">In it now</TableHead>
                  <TableHead className="text-right">Out on vans</TableHead>
                  <TableHead className="text-right">Total value</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {wh.warehouses.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-gray-700">No warehouses yet. Add your first one.</TableCell></TableRow>
                )}
                {wh.warehouses.map((w) => {
                  const s = stats[w.id] ?? EMPTY;
                  return (
                    <TableRow key={w.id} className={w.is_active ? '' : 'bg-gray-50 text-gray-600'}>
                      <TableCell>
                        <span className="font-semibold">{w.name}</span>
                        {w.address && <span className="block text-sm">{w.address}</span>}
                        {w.notes && <span className="block text-sm text-gray-600">{w.notes}</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{loadingStats ? '…' : s.home}</TableCell>
                      <TableCell className="text-right">{loadingStats ? '…' : s.inside}</TableCell>
                      <TableCell className="text-right">{loadingStats ? '…' : s.onVans}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {loadingStats ? '…' : formatMoney(s.value)}
                        {!loadingStats && s.unpriced > 0 && <span className="block text-xs text-gray-600">{s.unpriced} without a price</span>}
                      </TableCell>
                      <TableCell><Badge variant={w.is_active ? 'default' : 'secondary'}>{w.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" className="h-11 border-2" onClick={() => setEditing(w)} aria-label={`Edit ${w.name}`}>
                              <Pencil className="mr-1 h-4 w-4" /> Edit
                            </Button>
                            {w.is_active ? (
                              <Button variant="outline" className="h-11 border-2 border-red-700 text-red-800" onClick={() => setDeactivating(w)}
                                disabled={wh.active.length <= 1} title={wh.active.length <= 1 ? 'Your only active warehouse can’t be deactivated' : undefined}>
                                <Power className="mr-1 h-4 w-4" /> Deactivate
                              </Button>
                            ) : (
                              <Button variant="outline" className="h-11 border-2" onClick={() => reactivate(w)} disabled={busyId === w.id}>
                                {busyId === w.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Power className="mr-1 h-4 w-4" />} Reactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {wh.warehouses.length > 0 && (
                  <TableRow className="border-t-2 border-gray-800 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{loadingStats ? '…' : totals.home}</TableCell>
                    <TableCell /><TableCell />
                    <TableCell className="whitespace-nowrap text-right">{loadingStats ? '…' : formatMoney(totals.value)}</TableCell>
                    <TableCell />
                    {isAdmin && <TableCell />}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {editing && companyId && (
        <WarehouseEditDialog
          warehouse={editing === 'new' ? null : editing}
          companyId={companyId}
          userId={userProfile?.id}
          onClose={() => setEditing(null)}
          onSaved={async (w, isNew) => {
            setEditing(null);
            toast({ title: isNew ? 'Warehouse added' : 'Warehouse saved', description: w.name });
            await refresh();
          }}
        />
      )}
      {deactivating && companyId && (
        <DeactivateWarehouseDialog
          warehouse={deactivating}
          others={wh.active.filter((w) => w.id !== deactivating.id)}
          companyId={companyId}
          userId={userProfile?.id}
          onClose={() => setDeactivating(null)}
          onDone={async (msg) => {
            setDeactivating(null);
            toast({ title: 'Warehouse deactivated', description: msg });
            await refresh();
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
};

/** Add a warehouse, or rename / change address and notes. */
const WarehouseEditDialog: React.FC<{
  warehouse: Warehouse | null;
  companyId: string;
  userId: string | undefined;
  onClose: () => void;
  onSaved: (w: Warehouse, isNew: boolean) => void;
}> = ({ warehouse, companyId, userId, onClose, onSaved }) => {
  const [name, setName] = useState(warehouse?.name ?? '');
  const [address, setAddress] = useState(warehouse?.address ?? '');
  const [notes, setNotes] = useState(warehouse?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const w = warehouse
        ? await updateWarehouse(companyId, userId, warehouse, { name, address, notes })
        : await createWarehouse(companyId, userId, { name, address, notes });
      onSaved(w, !warehouse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{warehouse ? `Edit ${warehouse.name}` : 'Add warehouse'}</DialogTitle>
          <DialogDescription className="text-base text-gray-700">
            {warehouse ? 'Renaming changes the name everywhere; tools stay where they are.' : 'e.g. "North Shop" or "HVAC/R Tool Crib".'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="wh-name">Name *</Label>
          <Input id="wh-name" className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wh-address">Address</Label>
          <Input id="wh-address" className="h-12 text-base" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wh-notes">Notes</Label>
          <Textarea id="wh-notes" rows={3} className="text-base" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <FormAlert error={error} />
        <DialogFooter>
          <Button variant="outline" className="h-14 border-2 border-gray-800 text-base" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="h-14 bg-blue-700 text-base font-semibold text-white hover:bg-blue-800" onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}{warehouse ? 'Save' : 'Add warehouse'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Deactivate: only when no tool belongs to it or is in it; otherwise offer to move them first. */
const DeactivateWarehouseDialog: React.FC<{
  warehouse: Warehouse;
  others: Warehouse[];
  companyId: string;
  userId: string | undefined;
  onClose: () => void;
  onDone: (message: string) => void;
  onChanged: () => void;
}> = ({ warehouse, others, companyId, userId, onClose, onDone, onChanged }) => {
  const [counts, setCounts] = useState<{ home: number; inside: number } | null>(null);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = useCallback(async () => {
    const [home, inside] = await Promise.all([
      supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('home_warehouse_id', warehouse.id),
      supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('current_warehouse_id', warehouse.id),
    ]);
    if (home.error || inside.error) { setError((home.error ?? inside.error)!.message); return; }
    setCounts({ home: home.count ?? 0, inside: inside.count ?? 0 });
  }, [companyId, warehouse.id]);
  useEffect(() => { count(); }, [count]);

  const empty = counts !== null && counts.home === 0 && counts.inside === 0;
  const to = useMemo(() => others.find((w) => w.id === target), [others, target]);

  const deactivate = async () => {
    await updateWarehouse(companyId, userId, warehouse, { is_active: false });
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      let msg = `${warehouse.name} is now inactive.`;
      if (!empty) {
        if (!to) throw new Error('Choose where the tools should go.');
        const r = await moveWarehouseContents(companyId, userId, warehouse, to);
        onChanged();
        // Check again before deactivating: never leave tools pointing at an inactive warehouse.
        const [h, i] = await Promise.all([
          supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('home_warehouse_id', warehouse.id),
          supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('current_warehouse_id', warehouse.id),
        ]);
        if ((h.count ?? 0) + (i.count ?? 0) > 0) {
          setCounts({ home: h.count ?? 0, inside: i.count ?? 0 });
          throw new Error(`Some tools couldn't be moved (you may not have permission for them), so ${warehouse.name} was NOT deactivated.`);
        }
        msg = `${plural(r.moved, 'tool')} moved and ${plural(r.rehomed, 'tool')} now belong to ${to.name}. ${msg}`;
      }
      await deactivate();
      onDone(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Deactivate {warehouse.name}?</DialogTitle>
          <DialogDescription className="text-base text-gray-800">
            {counts === null ? 'Checking for tools…'
              : empty ? 'No tools belong to it or are in it. It will be hidden from the warehouse lists; its history is kept and you can reactivate it later.'
              : `It still has tools: ${plural(counts.home, 'tool')} belong here and ${counts.inside} ${counts.inside === 1 ? 'is' : 'are'} in it now. Move them to another warehouse first.`}
          </DialogDescription>
        </DialogHeader>
        {counts === null && !error && <p className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Counting…</p>}
        {counts !== null && !empty && (
          <div className="space-y-1.5">
            <Label htmlFor="wh-move-to">Move the tools to</Label>
            <Select value={target} onValueChange={setTarget} disabled={busy}>
              <SelectTrigger id="wh-move-to" className="h-14 border-2 border-gray-800 text-base"><SelectValue placeholder="Choose a warehouse" /></SelectTrigger>
              <SelectContent>
                {others.map((w) => <SelectItem key={w.id} value={w.id} className="min-h-[48px] text-base">{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-700">Tools in {warehouse.name} move there now, and tools out on vans that belong to {warehouse.name} will belong there instead. Every move is recorded in the history.</p>
          </div>
        )}
        <FormAlert error={error} />
        <DialogFooter>
          <Button variant="outline" className="h-14 border-2 border-gray-800 text-base" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="h-14 bg-red-700 text-base font-semibold text-white hover:bg-red-800" onClick={run}
            disabled={busy || counts === null || (!empty && !to)}>
            {busy && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {empty ? 'Deactivate' : `Move tools and deactivate`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
