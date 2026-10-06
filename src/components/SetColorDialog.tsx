import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FormAlert } from '@/components/auth/FormAlert';
import { ColorSelect } from '@/components/ColorSelect';
import { colorLabel, setColorOnTools } from '@/lib/toolColor';

interface Props {
  open: boolean;
  onClose: () => void;
  tools: { id: string; name: string; color?: string | null }[];
  companyId?: string;
  userId?: string;
  onSaved: () => Promise<void> | void;
}

/** Set one color (or none) on all the ticked tools. */
export const SetColorDialog: React.FC<Props> = ({ open, onClose, tools, companyId, userId, onSaved }) => {
  const { toast } = useToast();
  const [color, setColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setColor(''); setError(null); } }, [open]);

  const already = tools.filter((t) => t.color).length;
  const names = [...new Set(tools.map((t) => t.name))];
  const n = tools.length;

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      const changed = await setColorOnTools(companyId, userId, tools, color || null);
      toast({ title: 'Color saved', description: `${color ? colorLabel(color) : 'No color'} on ${changed} tool${changed === 1 ? '' : 's'}.` });
      if (changed < n) setError(`Only ${changed} of ${n} tools could be changed (you may not have permission for some).`);
      else await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Set color</DialogTitle>
          <DialogDescription className="text-base text-gray-700">
            For {n} tool{n === 1 ? '' : 's'}
            {names.length <= 3 ? `: ${names.join(', ')}` : ` (${names.length} different kinds)`}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-color">Color</Label>
          <ColorSelect id="bulk-color" value={color} onChange={setColor} className="h-14 border-2 border-gray-800 text-base" />
          <p className="text-sm text-gray-700">Choose "None" to remove the color.</p>
        </div>
        {already > 0 && (
          <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
            {already} of these already {already === 1 ? 'has' : 'have'} a color; it will be replaced.
          </p>
        )}
        <FormAlert error={error} />
        <DialogFooter>
          <Button variant="outline" className="h-14 border-2 border-gray-800 text-base" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="h-14 bg-blue-700 text-base font-semibold text-white hover:bg-blue-800" onClick={save} disabled={saving || !companyId}>
            {saving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />} Save on {n} tool{n === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
