import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tri } from '@/lib/selection';

/** A checkbox with a 48px tap area (the whole box around it is clickable). */
export const SelectBox: React.FC<{ checked: Tri; onChange: (on: boolean) => void; label: string; disabled?: boolean }> = ({
  checked, onChange, label, disabled,
}) => (
  <label className="flex h-12 w-12 cursor-pointer items-center justify-center" onClick={(e) => e.stopPropagation()}>
    <Checkbox
      className="h-6 w-6 border-2 border-gray-800"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      // Clicking a half-ticked box selects everything.
      onCheckedChange={() => onChange(checked !== true)}
    />
  </label>
);
