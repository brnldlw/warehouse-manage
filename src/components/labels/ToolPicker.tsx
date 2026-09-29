import React, { useMemo, useState } from 'react';
import { SearchBox } from '@/components/SearchBox';
import { matchesSearch } from '@/lib/search';
import { ReportItem } from '@/lib/inventoryReport';

const MAX_SHOWN = 40;

/** Search the company's tools (name, serial, barcode, category, van) and pick one. */
export const ToolPicker: React.FC<{ tools: ReportItem[]; selectedId?: string; onPick: (tool: ReportItem) => void }> = ({
  tools, selectedId, onPick,
}) => {
  const [search, setSearch] = useState('');
  const matches = useMemo(
    () => tools.filter((t) => matchesSearch(search, t.name, t.serial, t.barcode, t.categoryName, t.locationName))
      .sort((a, b) => a.name.localeCompare(b.name) || a.serial.localeCompare(b.serial)),
    [tools, search],
  );
  return (
    <div className="space-y-2">
      <SearchBox value={search} onChange={setSearch} placeholder="Pick a tool: search name, serial, barcode or van…"
        shown={matches.length} total={tools.length} noun="tools" />
      <div className="max-h-80 overflow-y-auto rounded-md border divide-y">
        {matches.slice(0, MAX_SHOWN).map((t) => (
          <button key={t.id} type="button" onClick={() => onPick(t)}
            className={`flex w-full min-h-[56px] items-center justify-between gap-3 px-3 py-2 text-left hover:bg-blue-50 ${t.id === selectedId ? 'bg-blue-100' : ''}`}>
            <span className="min-w-0">
              <span className="block font-medium text-gray-900">{t.name}</span>
              <span className="block text-sm text-gray-700">
                {[t.serial && `SN ${t.serial}`, t.locationName, t.categoryName].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className={`shrink-0 font-mono text-sm ${t.barcode ? 'text-gray-900' : 'text-orange-700'}`}>{t.barcode || 'no code'}</span>
          </button>
        ))}
        {matches.length === 0 && <p className="p-4 text-center text-gray-700">No tools match.</p>}
        {matches.length > MAX_SHOWN && <p className="p-3 text-center text-sm text-gray-700">Showing the first {MAX_SHOWN} — type more to narrow it down.</p>}
      </div>
    </div>
  );
};
