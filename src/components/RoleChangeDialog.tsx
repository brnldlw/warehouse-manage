import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { FormAlert } from '@/components/auth/FormAlert';
import { AppRole, setUserRole } from '@/lib/adminTechApi';

const ADMIN_POWERS = 'Admins can add, edit, delete and move all tools, manage technicians and vans, and change roles.';

/** "Make [Name] an admin?" / "Make [Name] a tech?" The change itself happens on the server. */
export const RoleChangeDialog: React.FC<{
  userId: string;
  name: string;
  to: AppRole;
  onClose: () => void;
  onChanged: (to: AppRole) => void;
}> = ({ userId, name, to, onClose, onChanged }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const makeAdmin = to === 'admin';

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await setUserRole(userId, to);
      onChanged(to);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {makeAdmin ? <ShieldCheck className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
            {makeAdmin ? `Make ${name} an admin?` : `Make ${name} a tech?`}
          </DialogTitle>
          <DialogDescription className="text-base text-gray-800">
            {makeAdmin
              ? ADMIN_POWERS
              : `${name} will no longer be able to add, edit, delete or move tools, manage technicians and vans, or change roles.`}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-gray-700">The change is recorded with your name. {name} may need to sign out and back in to see it.</p>
        <FormAlert error={error} />
        <DialogFooter>
          <Button variant="outline" className="h-14 border-2 border-gray-800 text-base" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className={`h-14 text-base font-semibold text-white ${makeAdmin ? 'bg-blue-700 hover:bg-blue-800' : 'bg-gray-900 hover:bg-gray-800'}`}
            onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {makeAdmin ? 'Make admin' : 'Make tech'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
