import React, { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { FormAlert } from '@/components/auth/FormAlert';
import { TruckInfo } from '@/lib/inventoryReport';
import { createVan } from '@/lib/vans';

export interface VanOption extends TruckInfo {
  /** Technicians assigned to this van now (shown so vans named after people aren't confused with them). */
  techs?: string[];
}

const NONE = '__none__';
const CREATE = '__create__';

const sortVans = (vans: VanOption[]) => [...vans].sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  || a.identifier.localeCompare(b.identifier, undefined, { numeric: true, sensitivity: 'base' }));

interface Props {
  vans: VanOption[];
  /** Selected van id, or '' for none. */
  value: string;
  onChange: (vanId: string) => void;
  noneLabel?: string;
  /** Offer "+ Create new van" (needs companyId). */
  allowCreate?: boolean;
  companyId?: string;
  userId?: string;
  onVanCreated?: (van: VanOption) => void;
  id?: string;
}

/** Pull-down of this company's vans: "Van 12 · ABC-123 — Mike Smith", plus "No van" and "+ Create new van". */
export const VanSelect: React.FC<Props> = ({
  vans, value, onChange, noneLabel = 'No van', allowCreate, companyId, userId, onVanCreated, id,
}) => {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A just-created van is selected only once it's in the list. Selecting it in the same
  // update makes the pull-down's hidden browser <select> fall back to "No van".
  const [selectWhenListed, setSelectWhenListed] = useState<string | null>(null);
  const sorted = useMemo(() => sortVans(vans), [vans]);

  useEffect(() => {
    if (selectWhenListed && vans.some((v) => v.id === selectWhenListed)) {
      onChange(selectWhenListed);
      setSelectWhenListed(null);
    }
  }, [vans, selectWhenListed, onChange]);

  const pick = (v: string) => {
    if (v === CREATE) { setCreating(true); setError(null); return; }
    onChange(v === NONE ? '' : v);
  };

  const create = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    const r = await createVan(companyId, userId, name, identifier);
    setSaving(false);
    if (r.error) { setError(r.error); return; }
    onVanCreated?.(r.van!);
    setSelectWhenListed(r.van!.id);
    setCreating(false);
    setName('');
    setIdentifier('');
  };

  return (
    <div className="space-y-2">
      <Select value={value || NONE} onValueChange={pick}>
        <SelectTrigger id={id} className="h-12 text-base"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="py-3 text-base">{noneLabel}</SelectItem>
          {sorted.map((v) => (
            <SelectItem key={v.id} value={v.id} className="py-3 text-base">
              {v.name}{v.identifier ? ` · ${v.identifier}` : ''}
              <span className="text-gray-600"> — {v.techs?.length ? v.techs.join(', ') : 'no tech assigned'}</span>
            </SelectItem>
          ))}
          {sorted.length === 0 && <div className="px-3 py-2 text-sm text-gray-700">No vans yet.</div>}
          {allowCreate && companyId && (
            <>
              <SelectSeparator />
              <SelectItem value={CREATE} className="py-3 text-base font-semibold text-blue-700">+ Create new van</SelectItem>
            </>
          )}
        </SelectContent>
      </Select>

      {creating && (
        <div className="space-y-3 rounded-md border-2 border-blue-700 bg-blue-50 p-3">
          <p className="font-semibold">New van</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id ?? 'van'}-new-name`}>Van name</Label>
              <Input id={`${id ?? 'van'}-new-name`} className="h-12 text-base bg-white" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Van 12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id ?? 'van'}-new-plate`}>Identifier / plate</Label>
              <Input id={`${id ?? 'van'}-new-plate`} className="h-12 text-base bg-white" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="e.g. ABC-123" />
            </div>
          </div>
          <FormAlert error={error} />
          <div className="flex gap-2">
            <Button type="button" className="h-12 bg-blue-700 hover:bg-blue-800 text-white" onClick={create} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Create van
            </Button>
            <Button type="button" variant="outline" className="h-12 border-2" onClick={() => { setCreating(false); setError(null); }} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
};
