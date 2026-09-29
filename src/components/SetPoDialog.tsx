import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FormAlert } from '@/components/auth/FormAlert';
import { setPoOnTools } from '@/lib/poSupport';

interface Props {
  open: boolean;
  onClose: () => void;
  tools: { id: string; name: string; poNumber?: string }[];
  companyId?: string;
  userId?: string;
  onSaved: () => Promise<void> | void;
}

/** Set one PO number (and optionally a purchase date) on all the ticked tools. */
export const SetPoDialog: React.FC<Props> = ({ open, onClose, tools, companyId, userId, onSaved }) => {
  const { toast } = useToast();
  const [po, setPo] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setPo(''); setDate(''); setError(null); } }, [open]);

  const already = tools.filter((t) => (t.poNumber || '').trim()).length;
  const names = [...new Set(tools.map((t) => t.name))];

  const save = async () => {
    if (!companyId) return;
    if (!po.trim()) { setError('Enter the PO number.'); return; }
    setSaving(true);
    setError(null);
    try {
      const n = await setPoOnTools(companyId, userId, tools, po, date || undefined);
      toast({ title: 'PO number saved', description: `${po.trim()} is now on ${n} tool${n === 1 ? '' : 's'}.` });
      if (n < tools.length) setError(`Only ${n} of ${tools.length} tools could be changed (you may not have permission for some).`);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle className="text-xl">Set PO number</DialogTitle>
          <DialogDescription className="text-base text-gray-700">
            For {tools.length} tool{tools.length === 1 ? '' : 's'}
            {names.length <= 3 ? `: ${names.join(', ')}` : ` (${names.length} different kinds)`}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-po">PO number</Label>
            <Input id="bulk-po" className="h-12 text-base" value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. PO-1042" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-po-date">Purchase date (optional)</Label>
            <Input id="bulk-po-date" type="date" className="h-12 text-base" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-sm text-gray-700">Leave empty to keep each tool's current purchase date.</p>
          </div>
          {already > 0 && (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
              {already} of these already {already === 1 ? 'has' : 'have'} a PO number; it will be replaced.
            </p>
          )}
          <FormAlert error={error} />
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="h-14 flex-1 text-base font-semibold bg-blue-700 hover:bg-blue-800 text-white" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-5 w-5 mr-2 animate-spin" />} Save on {tools.length} tool{tools.length === 1 ? '' : 's'}
            </Button>
            <Button variant="outline" className="h-14 text-base border-2 border-gray-800" onClick={onClose} disabled={saving}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
