import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';
import { PrintPortal } from '@/components/print/PrintPortal';
import { LABEL_LAYOUTS, LabelData, LabelSheet } from './LabelSheet';

/** Choose a label layout, preview the first sheet, and print. */
export const LabelPrintPanel: React.FC<{ labels: LabelData[]; defaultLayout?: string; buttonText?: string }> = ({
  labels, defaultLayout = 'avery5160', buttonText,
}) => {
  const { printing, print } = usePrint();
  const [layoutId, setLayoutId] = useState(defaultLayout);
  const [skip, setSkip] = useState(0);
  const layout = LABEL_LAYOUTS.find((l) => l.id === layoutId) ?? LABEL_LAYOUTS[0];
  const perPage = layout.cols * layout.rows;
  const sheets = layout.id === 'single' ? labels.length : Math.ceil((labels.length + skip) / perPage);
  const scale = 0.42;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5">
          <Label>Label paper</Label>
          <Select value={layoutId} onValueChange={(v) => { setLayoutId(v); setSkip(0); }}>
            <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LABEL_LAYOUTS.map((l) => <SelectItem key={l.id} value={l.id} className="py-3 text-base">{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {layout.id !== 'single' && (
          <div className="space-y-1.5">
            <Label htmlFor="label-skip">Start at label #</Label>
            <Input id="label-skip" type="number" min={1} max={perPage} className="h-12 w-28 text-base" value={skip + 1}
              onChange={(e) => setSkip(Math.max(0, Math.min(perPage - 1, (parseInt(e.target.value) || 1) - 1)))} />
          </div>
        )}
      </div>
      <p className="text-sm text-gray-700">
        {labels.length} label{labels.length === 1 ? '' : 's'} on {sheets} sheet{sheets === 1 ? '' : 's'}.
        In the print window choose <strong>Scale 100% / Actual size</strong> and margins <strong>Default</strong> or <strong>None</strong> so the labels line up.
        {layout.id !== 'single' && ' "Start at label #" lets you reuse a partly used sheet.'}
      </p>
      <Button className="h-14 px-6 text-base font-semibold bg-blue-700 hover:bg-blue-800 text-white" onClick={print} disabled={!labels.length}>
        <Printer className="h-5 w-5 mr-2" /> {buttonText ?? `Print ${labels.length} label${labels.length === 1 ? '' : 's'}`}
      </Button>

      {labels.length > 0 && (
        <div className="label-preview overflow-hidden rounded border bg-gray-100 p-2" style={{ height: `calc(11in * ${scale} + 16px)` }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: '8.5in' }}>
            <LabelSheet labels={labels.slice(0, layout.id === 'single' ? 1 : perPage - skip)} layout={layout} skip={skip} />
          </div>
        </div>
      )}

      {printing && (
        <PrintPortal bare>
          <LabelSheet labels={labels} layout={layout} skip={skip} />
        </PrintPortal>
      )}
    </div>
  );
};
