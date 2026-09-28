import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormAlert } from '@/components/auth/FormAlert';
import { Loader2, Mail, UserPlus } from 'lucide-react';
import { CreateTechResult, createTechnician, describeLinkLifetime } from '@/lib/adminTechApi';
import { TruckInfo, truckLabel } from '@/lib/inventoryReport';

const SPECIALTIES = ['Electrician', 'Plumber', 'HVAC Technician', 'Carpenter', 'Mechanic', 'Welder', 'General Maintenance', 'Other'];
const NO_VAN = '__none__';

interface Props {
  open: boolean;
  trucks: TruckInfo[];
  onClose: () => void;
  /** Called after a technician was created, so the list can reload. */
  onCreated: () => void;
}

const empty = { firstName: '', lastName: '', email: '', phone: '', specialty: '', truckId: NO_VAN, mode: 'invite' as 'invite' | 'no_email' };

export const AddTechnicianDialog: React.FC<Props> = ({ open, trucks, onClose, onCreated }) => {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateTechResult | null>(null);

  const set = (field: keyof typeof empty, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const close = () => {
    setForm(empty);
    setError(null);
    setResult(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const r = await createTechnician({ ...form, truckId: form.truckId === NO_VAN ? undefined : form.truckId });
      setResult(r);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const field = 'h-12 text-base';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-1rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl"><UserPlus className="h-5 w-5" /> Add Technician</DialogTitle>
          <DialogDescription className="text-base text-gray-700">
            Creates their login and adds them to your company as a technician.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <FormAlert info={
              result.emailSent
                ? `${result.name} was added. An invite email is on its way to ${form.email.trim()}. The link in it works for ${describeLinkLifetime(result.inviteLinkSeconds)}; if it runs out, use "Resend invite" on the Technicians page.`
                : `${result.name} was added without an email. To sign in the first time, they go to the sign-in page, click "Forgot password?" and enter ${form.email.trim()} — or use "Resend invite" to email them a set-password link.`
            } />
            {result.warning && <FormAlert error={result.warning} />}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button className="h-14 text-base flex-1" onClick={() => { setForm(empty); setResult(null); }}>Add another</Button>
              <Button variant="outline" className="h-14 text-base flex-1 border-2 border-gray-800" onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="at-first">First name</Label>
                <Input id="at-first" className={field} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="at-last">Last name</Label>
                <Input id="at-last" className={field} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="at-email">Email *</Label>
              <Input id="at-email" type="email" required className={field} value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="at-phone">Phone</Label>
                <Input id="at-phone" type="tel" className={field} value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label>Specialty</Label>
                <Select value={form.specialty} onValueChange={(v) => set('specialty', v)}>
                  <SelectTrigger className={field}><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map((s) => <SelectItem key={s} value={s} className="py-3 text-base">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Van to assign (optional)</Label>
              <Select value={form.truckId} onValueChange={(v) => set('truckId', v)}>
                <SelectTrigger className={field}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VAN} className="py-3 text-base">No van for now</SelectItem>
                  {trucks.map((t) => <SelectItem key={t.id} value={t.id} className="py-3 text-base">{truckLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-gray-900 mb-1">How should they get their password?</legend>
              {([
                ['invite', 'Send invite email (recommended)', 'They get an email with a link to set their own password.'],
                ['no_email', 'Create without sending email', 'No email now. They set a password later with "Forgot password?" or "Resend invite".'],
              ] as const).map(([value, title, hint]) => (
                <label key={value} className={`flex items-start gap-3 rounded-md border-2 p-3 cursor-pointer min-h-[56px] ${form.mode === value ? 'border-blue-700 bg-blue-50' : 'border-gray-300'}`}>
                  <input type="radio" name="at-mode" value={value} checked={form.mode === value} onChange={() => set('mode', value)} className="mt-1 h-5 w-5" />
                  <span>
                    <span className="block text-base font-medium">{title}</span>
                    <span className="block text-sm text-gray-700">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <FormAlert error={error} />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" className="h-14 text-base flex-1 bg-blue-700 hover:bg-blue-800 text-white" disabled={saving}>
                {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : form.mode === 'invite' ? <Mail className="h-5 w-5 mr-2" /> : <UserPlus className="h-5 w-5 mr-2" />}
                {saving ? 'Adding…' : form.mode === 'invite' ? 'Add and send invite' : 'Add technician'}
              </Button>
              <Button type="button" variant="outline" className="h-14 text-base border-2 border-gray-800" onClick={close}>Cancel</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
