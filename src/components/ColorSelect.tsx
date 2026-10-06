import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NO_COLOR, TOOL_COLORS } from '@/lib/toolColor';

const Swatch: React.FC<{ hex?: string }> = ({ hex }) => (
  <span
    aria-hidden
    className={`mr-2 inline-block h-4 w-4 shrink-0 rounded-full border border-gray-500 align-middle ${hex ? '' : 'bg-[repeating-linear-gradient(45deg,#fff,#fff_2px,#d1d5db_2px,#d1d5db_4px)]'}`}
    style={hex ? { backgroundColor: hex } : undefined}
  />
);

/** "Color" pull-down: None, Red, Orange, … each with a small swatch. value '' = none. */
export const ColorSelect: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Extra first option, e.g. for a filter: { value: 'all', label: 'All colors' }. */
  allOption?: { value: string; label: string };
}> = ({ id, value, onChange, disabled, className = '', allOption }) => (
  <Select value={value || NO_COLOR} onValueChange={(v) => onChange(v === NO_COLOR ? '' : v)} disabled={disabled}>
    <SelectTrigger id={id} className={className}>
      <SelectValue placeholder="Color" />
    </SelectTrigger>
    <SelectContent>
      {allOption && <SelectItem value={allOption.value}>{allOption.label}</SelectItem>}
      <SelectItem value={NO_COLOR}><span className="flex items-center"><Swatch />{allOption ? 'No color' : 'None'}</span></SelectItem>
      {TOOL_COLORS.map((c) => (
        <SelectItem key={c.value} value={c.value}>
          <span className="flex items-center"><Swatch hex={c.hex} />{c.label}</span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
