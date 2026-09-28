import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Sparkles, Tag, Wand2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { FormAlert } from '@/components/auth/FormAlert';
import { SearchBox } from '@/components/SearchBox';
import { ToolPicker } from '@/components/labels/ToolPicker';
import { LabelPrintPanel } from '@/components/labels/LabelPrintPanel';
import { LinearBarcodeSvg, QrSvg } from '@/components/labels/CodeGraphics';
import { LabelData } from '@/components/labels/LabelSheet';
import { FreeformBarcodeGenerator } from '@/components/labels/FreeformBarcodeGenerator';
import { ReportData, ReportItem, loadReportData } from '@/lib/inventoryReport';
import { matchesSearch } from '@/lib/search';
import { BulkAssignOutcome, assignBarcode, assignCodesInBulk, companyPrefix, loadCompanyBarcodes, nextCodes } from '@/lib/toolCodes';

const toLabel = (t: ReportItem, code = t.barcode): LabelData => ({
  id: t.id, code, name: t.name, detail: t.serial ? `SN ${t.serial}` : t.locationName,
});

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="space-y-4 rounded-lg border-2 border-gray-200 p-4 md:p-5">
    <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900">{icon}{title}</h3>
    {children}
  </section>
);

export const BarcodeGenerator: React.FC = () => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const companyId = userProfile?.company_id;

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setData(await loadReportData(companyId));
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: "Couldn't load tools.", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  /** Keep the local copy in step after saving codes. */
  const setToolCodes = (codes: Record<string, string>) =>
    setData((d) => d && { ...d, items: d.items.map((i) => (codes[i.id] ? { ...i, barcode: codes[i.id] } : i)) });

  if (loading || !data) {
    return <div className="flex items-center justify-center gap-3 py-16 text-gray-700"><Loader2 className="h-6 w-6 animate-spin" /> Loading tools…</div>;
  }

  const prefix = companyPrefix(data.companyName);

  return (
    <div className="space-y-6">
      <p className="text-base text-gray-700">
        Codes look like <span className="font-mono font-semibold">{prefix}-00001</span>: "{prefix}" comes from your company name, and the number goes up by one each time.
      </p>
      <OneToolSection data={data} prefix={prefix} companyId={companyId!} userId={userProfile?.id} onSaved={setToolCodes} />
      <BulkSection data={data} companyId={companyId!} userId={userProfile?.id} onSaved={setToolCodes} />
      <Section title="Make a code from any text" icon={<Tag className="h-5 w-5" />}>
        <p className="text-sm text-gray-700">The original generator: turns any text into a QR code or barcode image. It doesn't save anything to a tool.</p>
        <FreeformBarcodeGenerator />
      </Section>
    </div>
  );
};

// ---------------------------------------------------------------------------

const OneToolSection: React.FC<{
  data: ReportData; prefix: string; companyId: string; userId?: string; onSaved: (codes: Record<string, string>) => void;
}> = ({ data, prefix, companyId, userId, onSaved }) => {
  const { toast } = useToast();
  const [toolId, setToolId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [format, setFormat] = useState<'qr' | 'linear'>('qr');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const tool = data.items.find((t) => t.id === toolId) ?? null;

  const pick = (t: ReportItem) => { setToolId(t.id); setCode(t.barcode); setError(null); };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      setCode(nextCodes(await loadCompanyBarcodes(companyId), prefix)[0]);
    } catch (err) {
      setError(`Couldn't work out the next code: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!tool) return;
    setConfirmReplace(false);
    setBusy(true);
    setError(null);
    const r = await assignBarcode(companyId, userId, tool, code);
    setBusy(false);
    if (!r.ok) { setError(r.reason ?? 'The code was not saved.'); return; }
    onSaved({ [tool.id]: code.trim() });
    toast({ title: 'Code assigned', description: `${code.trim()} is now on "${tool.name}".` });
  };

  const assign = () => {
    if (tool?.barcode && tool.barcode !== code.trim()) setConfirmReplace(true);
    else save();
  };

  return (
    <Section title="Code for one tool" icon={<Wand2 className="h-5 w-5" />}>
      <ToolPicker tools={data.items} selectedId={toolId ?? undefined} onPick={pick} />
      {tool && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rounded-md bg-gray-50 p-4">
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold text-gray-900">{tool.name}</p>
              <p className="text-sm text-gray-700">{[tool.serial && `SN ${tool.serial}`, tool.locationName, tool.categoryName].filter(Boolean).join(' · ')}</p>
              <p className="text-sm text-gray-700 mt-1">Current code: <span className="font-mono font-semibold">{tool.barcode || 'none'}</span></p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="one-code">Code</Label>
              <div className="flex gap-2">
                <Input id="one-code" className="h-12 text-base font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder={`${prefix}-00001 or type/paste your own`} />
                <Button type="button" variant="outline" className="h-12 border-2 border-gray-800" onClick={generate} disabled={busy}>
                  <Sparkles className="h-4 w-4 mr-1" /> Generate
                </Button>
              </div>
            </div>
            <div className="flex rounded-md border-2 border-gray-800 overflow-hidden w-fit" role="group" aria-label="Code type">
              {(['qr', 'linear'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  className={`h-12 px-4 text-base font-medium ${format === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
                  {f === 'qr' ? 'QR code' : 'Barcode'}
                </button>
              ))}
            </div>
            <FormAlert error={error} />
            <Button className="h-14 w-full text-base font-semibold bg-blue-700 hover:bg-blue-800 text-white" onClick={assign}
              disabled={busy || !code.trim() || code.trim() === tool.barcode}>
              {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : null}
              {code.trim() && code.trim() === tool.barcode ? 'This code is already on the tool' : 'Assign to this tool'}
            </Button>
          </div>
          <div className="space-y-4">
            {code.trim() ? (
              <div className="flex flex-col items-center gap-2 rounded-md border bg-white p-4">
                {format === 'qr' ? <QrSvg value={code.trim()} size="180px" /> : <LinearBarcodeSvg value={code.trim()} className="max-w-full" />}
                <span className="font-mono text-lg font-bold">{code.trim()}</span>
                <span className="text-center font-semibold">{tool.name}</span>
              </div>
            ) : <p className="text-gray-700">Generate or type a code to see a preview.</p>}
            {tool.barcode && code.trim() === tool.barcode ? (
              <LabelPrintPanel labels={[toLabel(tool)]} defaultLayout="single" buttonText="Print label" />
            ) : code.trim() ? (
              <p className="text-base text-gray-700">Click “Assign to this tool” first; then you can print its label.</p>
            ) : null}
          </div>
        </div>
      )}

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this tool's code?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              "{tool?.name}" already has <strong className="font-mono">{tool?.barcode}</strong>. Replace it with <strong className="font-mono">{code.trim()}</strong>?
              Any label already stuck on the tool will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12">Keep the old code</AlertDialogCancel>
            <AlertDialogAction className="h-12 bg-red-700 hover:bg-red-800" onClick={save}>Replace it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
};

// ---------------------------------------------------------------------------

const BulkSection: React.FC<{
  data: ReportData; companyId: string; userId?: string; onSaved: (codes: Record<string, string>) => void;
}> = ({ data, companyId, userId, onSaved }) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [proposed, setProposed] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BulkAssignOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withoutCode = useMemo(() => data.items.filter((t) => !t.barcode.trim())
    .sort((a, b) => a.name.localeCompare(b.name) || a.serial.localeCompare(b.serial)), [data.items]);
  const shown = withoutCode.filter((t) => matchesSearch(search, t.name, t.serial, t.categoryName, t.locationName));
  const allShownSelected = shown.length > 0 && shown.every((t) => selected.has(t.id));

  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const toggleAll = (on: boolean) => setSelected((s) => { const n = new Set(s); shown.forEach((t) => (on ? n.add(t.id) : n.delete(t.id))); return n; });

  const picked = withoutCode.filter((t) => selected.has(t.id));

  const propose = async () => {
    setError(null);
    setBusy(true);
    try {
      const codes = nextCodes(await loadCompanyBarcodes(companyId), companyPrefix(data.companyName), picked.length);
      setProposed(Object.fromEntries(picked.map((t, i) => [t.id, codes[i]])));
    } catch (err) {
      setError(`Couldn't work out the codes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const assignAll = async () => {
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const r = await assignCodesInBulk(companyId, userId, data.companyName, picked, setProgress);
      setResults(r);
      onSaved(Object.fromEntries(r.filter((x) => x.code).map((x) => [x.toolId, x.code!])));
      setProposed(null);
      setSelected(new Set());
    } catch (err) {
      setError(`Stopped: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const byId = new Map(data.items.map((t) => [t.id, t]));
  const done = results?.filter((r) => r.code) ?? [];
  const failed = results?.filter((r) => r.error) ?? [];

  return (
    <Section title={`Codes for tools without one (${withoutCode.length})`} icon={<Sparkles className="h-5 w-5" />}>
      {results ? (
        <div className="space-y-4">
          <FormAlert info={`${done.length} code${done.length === 1 ? '' : 's'} assigned.`} />
          {failed.length > 0 && (
            <FormAlert error={`${failed.length} tool${failed.length === 1 ? '' : 's'} not coded: ${failed.map((f) => `${byId.get(f.toolId)?.name}: ${f.error}`).join(' · ')}`} />
          )}
          {done.length > 0 && (
            <LabelPrintPanel labels={done.map((r) => toLabel(byId.get(r.toolId)!, r.code))} />
          )}
          <Button variant="outline" className="h-14 text-base border-2 border-gray-800" onClick={() => setResults(null)}>Code more tools</Button>
        </div>
      ) : proposed ? (
        <div className="space-y-4">
          <p className="text-base">These codes will be saved on {picked.length} tool{picked.length === 1 ? '' : 's'}:</p>
          <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
            {picked.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0"><span className="font-medium">{t.name}</span> <span className="text-sm text-gray-700">{[t.serial && `SN ${t.serial}`, t.locationName].filter(Boolean).join(' · ')}</span></span>
                <span className="shrink-0 font-mono font-semibold">{proposed[t.id]}</span>
              </div>
            ))}
          </div>
          <FormAlert error={error} />
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="h-14 text-base font-semibold bg-blue-700 hover:bg-blue-800 text-white" onClick={assignAll} disabled={busy}>
              {busy ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Saving {progress} of {picked.length}…</> : `Assign ${picked.length} codes`}
            </Button>
            <Button variant="outline" className="h-14 text-base border-2 border-gray-800" onClick={() => setProposed(null)} disabled={busy}>Back</Button>
          </div>
        </div>
      ) : withoutCode.length === 0 ? (
        <p className="text-base text-gray-700">Every tool has a code.</p>
      ) : (
        <div className="space-y-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search tools without a code…" shown={shown.length} total={withoutCode.length} noun="tools" />
          <label className="flex items-center gap-3 min-h-[48px] cursor-pointer text-base font-medium">
            <Checkbox className="h-6 w-6" checked={allShownSelected} onCheckedChange={(v) => toggleAll(v === true)} />
            Select all {search ? 'shown' : ''} ({shown.length})
          </label>
          <div className="max-h-80 overflow-y-auto rounded-md border divide-y">
            {shown.map((t) => (
              <label key={t.id} className="flex items-center gap-3 px-3 min-h-[52px] cursor-pointer hover:bg-gray-50">
                <Checkbox className="h-6 w-6" checked={selected.has(t.id)} onCheckedChange={(v) => toggle(t.id, v === true)} />
                <span className="min-w-0">
                  <span className="block font-medium">{t.name}</span>
                  <span className="block text-sm text-gray-700">{[t.serial && `SN ${t.serial}`, t.locationName, t.categoryName].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            ))}
          </div>
          <FormAlert error={error} />
          <Button className="h-14 text-base font-semibold bg-blue-700 hover:bg-blue-800 text-white" onClick={propose} disabled={busy || picked.length === 0}>
            {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Sparkles className="h-5 w-5 mr-2" />}
            Generate codes for {picked.length} selected
          </Button>
        </div>
      )}
    </Section>
  );
};
