import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Printer, ScanLine, Sparkles } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';
import { PrintPortal } from '@/components/print/PrintPortal';
import { CameraScanDialog } from './CameraScanDialog';
import { LinearBarcodeSvg, QrSvg } from './CodeGraphics';
import { LABEL_LAYOUTS, LabelSheet } from './LabelSheet';
import { describeConflict, findToolWithBarcode, generateNextCode } from '@/lib/toolCodes';

interface Props {
  value: string;
  onChange: (value: string) => void;
  companyId?: string;
  companyName: string;
  toolId?: string;
  toolName: string;
  detail?: string;
  /** Tell the parent whether the typed code clashes with another tool. */
  onConflictChange?: (message: string | null) => void;
}

/**
 * Barcode/QR input for a tool: type, paste, scan with the camera, or Generate the next
 * company code. Checks as you type that no other tool uses it; shows a preview and prints a label.
 */
export const BarcodeField: React.FC<Props> = ({ value, onChange, companyId, companyName, toolId, toolName, detail, onConflictChange }) => {
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [format, setFormat] = useState<'qr' | 'linear'>('qr');
  const { printing, print } = usePrint();
  const code = value.trim();

  // Check uniqueness shortly after typing stops.
  useEffect(() => {
    if (!code || !companyId) { setConflict(null); onConflictChange?.(null); return; }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const hit = await findToolWithBarcode(companyId, code, toolId);
        if (cancelled) return;
        const msg = hit ? describeConflict(code, hit) : null;
        setConflict(msg);
        onConflictChange?.(msg);
      } catch { /* the save step checks again */ }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, companyId, toolId]);

  const generate = async () => {
    if (!companyId) return;
    setGenerating(true);
    try { onChange(await generateNextCode(companyId, companyName)); }
    catch (err) { setConflict(`Couldn't generate a code: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setGenerating(false); }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="edit-barcode">Barcode / QR code</Label>
      <Input id="edit-barcode" className="h-12 text-base font-mono" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Type, paste, scan or generate" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11 border-2" onClick={() => setScanning(true)}>
          <ScanLine className="h-4 w-4 mr-1" /> Scan
        </Button>
        <Button type="button" variant="outline" className="h-11 border-2" onClick={generate} disabled={generating || !companyId}>
          {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Generate
        </Button>
        {code && (
          <Button type="button" variant="outline" className="h-11 border-2" onClick={print}>
            <Printer className="h-4 w-4 mr-1" /> Print label
          </Button>
        )}
      </div>
      {conflict && <p role="alert" className="rounded-md border-2 border-red-700 bg-red-50 p-2 text-sm text-red-900">{conflict}</p>}
      {code && (
        <div className="flex items-center gap-3 rounded-md border bg-white p-2">
          <button type="button" onClick={() => setFormat((f) => (f === 'qr' ? 'linear' : 'qr'))} title="Switch QR / barcode" className="shrink-0">
            {format === 'qr' ? <QrSvg value={code} size="72px" /> : <LinearBarcodeSvg value={code} height={40} className="h-12 max-w-[180px]" />}
          </button>
          <span className="text-sm text-gray-700">Preview · tap it to switch between QR code and barcode. Labels print as QR codes.</span>
        </div>
      )}
      <CameraScanDialog open={scanning} onClose={() => setScanning(false)} onDetected={(text) => { setScanning(false); onChange(text); }} />
      {printing && (
        <PrintPortal bare>
          <LabelSheet labels={[{ id: toolId ?? 'new', code, name: toolName, detail }]} layout={LABEL_LAYOUTS.find((l) => l.id === 'single')!} />
        </PrintPortal>
      )}
    </div>
  );
};
