import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileSpreadsheet, FileText, Loader2, Printer, ShoppingCart, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePrint } from '@/hooks/use-print';
import { SearchBox } from '@/components/SearchBox';
import { PrintPortal } from '@/components/print/PrintPortal';
import { PrintSection, TableReportDocument } from '@/components/print/TableReportDocument';
import { matchesSearch } from '@/lib/search';
import { ReportData, ReportMeta, exportFileName, formatDateTime, loadReportData } from '@/lib/inventoryReport';
import { TableColumn, downloadTableCsv, downloadTableXlsx } from '@/lib/tableExport';
import { TransferLog, buildUsage, loadTransferLogs, techText, toOutEvents } from '@/lib/toolUsage';

type Period = '30' | '90' | '365' | 'custom';

const CURRENT_TECH_NOTE = 'Tech names show who is assigned to each van NOW (current assignment), not necessarily who had the van at the time.';
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const ToolUsageReport: React.FC = () => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const { printing, print } = usePrint();
  const companyId = userProfile?.company_id;

  const [base, setBase] = useState<ReportData | null>(null);
  const [logs, setLogs] = useState<TransferLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('90');
  const [customFrom, setCustomFrom] = useState(isoDate(new Date(Date.now() - 90 * 86400000)));
  const [customTo, setCustomTo] = useState(isoDate(new Date()));
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [threshold, setThreshold] = useState(3);

  const range = useMemo(() => {
    if (period === 'custom') {
      const from = new Date(`${customFrom}T00:00:00`);
      const to = new Date(`${customTo}T23:59:59.999`);
      return { from, to };
    }
    const to = new Date();
    return { from: new Date(to.getTime() - Number(period) * 86400000), to };
  }, [period, customFrom, customTo]);
  const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400000));
  const rangeValid = !Number.isNaN(range.from.getTime()) && !Number.isNaN(range.to.getTime()) && range.from <= range.to;

  useEffect(() => {
    if (!companyId) return;
    loadReportData(companyId).then(setBase).catch((err) => {
      console.error(err);
      toast({ title: 'Error', description: "Couldn't load vans and tools.", variant: 'destructive' });
    });
  }, [companyId, toast]);

  useEffect(() => {
    if (!companyId || !rangeValid) return;
    let cancelled = false;
    setLoading(true);
    loadTransferLogs(companyId, range.from, range.to)
      .then((l) => { if (!cancelled) setLogs(l); })
      .catch((err) => {
        console.error(err);
        toast({ title: 'Error', description: "Couldn't load the activity log.", variant: 'destructive' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, range.from.getTime(), range.to.getTime(), rangeValid]);

  const usage = useMemo(() => {
    if (!base || !logs) return null;
    return buildUsage(toOutEvents(logs, base.trucks), base.items, base.truckTechs, threshold);
  }, [base, logs, threshold]);

  const categories = useMemo(() => [...new Set((usage?.tools ?? []).map((t) => t.category))].sort(), [usage]);
  const tools = (usage?.tools ?? []).filter((t) =>
    (category === 'all' || t.category === category) &&
    matchesSearch(search, t.toolName, t.category, ...t.byVan.flatMap((v) => [v.vanLabel, ...v.techs])));
  const buyOne = (usage?.buyOne ?? []).filter((b) =>
    (category === 'all' || b.category === category) && matchesSearch(search, b.toolName, b.category, b.vanLabel, ...b.techs));

  const periodText = period === 'custom' ? `${day(range.from)} – ${day(range.to)}` : `Last ${period} days (${day(range.from)} – ${day(range.to)})`;
  const printedBy = [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ') || userProfile?.email || '';
  const meta: ReportMeta = {
    companyName: base?.companyName ?? '',
    title: 'Tool Usage Report',
    filtersText: [periodText, `Category: ${category === 'all' ? 'All' : category}`, search.trim() && `Search: "${search.trim()}"`, `"Buy one?" at ${threshold}+ times`].filter(Boolean).join('  ·  '),
    printedBy,
    printedAt: new Date(),
  };

  // ---- export shapes ----
  const buyCols: (TableColumn & { numeric?: boolean })[] = [
    { key: 'van', label: 'Van', width: 22 }, { key: 'tech', label: 'Current tech', width: 22 },
    { key: 'tool', label: 'Tool', width: 32 }, { key: 'times', label: 'Times', width: 8, numeric: true },
  ];
  const buyRows = buyOne.map((b) => ({ van: b.vanLabel, tech: techText(b.techs), tool: b.toolName, times: b.trips }));
  const toolCols: (TableColumn & { numeric?: boolean })[] = [
    { key: 'tool', label: 'Tool', width: 32 }, { key: 'category', label: 'Category', width: 18 },
    { key: 'times', label: 'Times sent out', width: 12, numeric: true }, { key: 'units', label: 'Units', width: 8, numeric: true },
    { key: 'vans', label: 'Vans', width: 7, numeric: true }, { key: 'techs', label: 'Techs', width: 7, numeric: true },
    { key: 'last', label: 'Last sent out', width: 20 }, { key: 'breakdown', label: 'By van (current tech) × times', width: 70 },
  ];
  const toolRows = tools.map((t) => ({
    tool: t.toolName, category: t.category, times: t.trips, units: t.units, vans: t.vanCount, techs: t.techCount,
    last: formatDateTime(new Date(t.lastOut)),
    breakdown: t.byVan.map((v) => `${v.vanLabel} (${techText(v.techs)}) ×${v.trips}`).join('; '),
  }));
  const flatCols: TableColumn[] = [
    { key: 'tool', label: 'Tool', width: 32 }, { key: 'category', label: 'Category', width: 18 },
    { key: 'van', label: 'Van', width: 22 }, { key: 'tech', label: 'Current tech', width: 22 },
    { key: 'times', label: 'Times sent out', width: 12 }, { key: 'units', label: 'Units', width: 8 },
    { key: 'last', label: 'Last sent out', width: 20 },
  ];
  const flatRows = tools.flatMap((t) => t.byVan.map((v) => ({
    tool: t.toolName, category: t.category, van: v.vanLabel, tech: techText(v.techs), times: v.trips, units: v.units,
    last: formatDateTime(new Date(v.lastOut)),
  })));
  const fileBase = `tool-usage-${period === 'custom' ? `${customFrom}_to_${customTo}` : `${period}-days`}`;

  const sections: PrintSection[] = [
    { title: `Buy one? — ${threshold}+ times in ${days} days`, columns: buyCols, rows: buyRows, empty: `No van took the same tool ${threshold} or more times.` },
    { title: 'Tool usage', columns: toolCols, rows: toolRows, empty: 'No tools were sent out to vans in this period.' },
  ];

  const bigButton = 'h-14 px-5 text-base font-semibold';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Tool Usage</CardTitle>
        <p className="text-base text-gray-700">How often each tool goes out to a van, from the transfer history. Each transfer is counted once.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
          {(['30', '90', '365', 'custom'] as Period[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={`h-12 rounded-md border-2 px-4 text-base font-medium ${period === p ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-800 bg-white text-gray-900'}`}>
              {p === 'custom' ? 'Custom dates' : `Last ${p} days`}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5"><Label htmlFor="tu-from">From</Label><Input id="tu-from" type="date" className="h-12 text-base" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="tu-to">To</Label><Input id="tu-to" type="date" className="h-12 text-base" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
            {!rangeValid && <p className="self-end text-base text-red-700">The "From" date must be before the "To" date.</p>}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_160px] gap-3 items-start">
          <SearchBox value={search} onChange={setSearch} placeholder="Search tool, van or tech…" shown={tools.length} total={usage?.tools.length ?? 0} noun="tools" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="py-3 text-base">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c} className="py-3 text-base">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label htmlFor="tu-threshold" className="whitespace-nowrap">Flag at</Label>
            <Input id="tu-threshold" type="number" min={2} max={99} className="h-12 w-20 text-base" value={threshold}
              onChange={(e) => setThreshold(Math.max(2, Math.min(99, parseInt(e.target.value) || 3)))} />
            <span>times</span>
          </div>
        </div>

        <p className="rounded-md border-2 border-amber-600 bg-amber-50 p-3 text-base text-amber-950">{CURRENT_TECH_NOTE}</p>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <Button className={`${bigButton} bg-blue-700 hover:bg-blue-800 text-white`} onClick={print} disabled={!usage}>
            <Printer className="h-5 w-5 mr-2" /> Print
          </Button>
          <Button variant="outline" className={`${bigButton} border-2 border-gray-800`} disabled={!usage}
            onClick={() => downloadTableCsv(exportFileName(meta.companyName, fileBase, 'csv'), flatCols, flatRows)}>
            <FileText className="h-5 w-5 mr-2" /> Download CSV
          </Button>
          <Button variant="outline" className={`${bigButton} border-2 border-gray-800`} disabled={!usage}
            onClick={() => downloadTableXlsx(exportFileName(meta.companyName, fileBase, 'xlsx'), [
              { name: 'Buy one', columns: buyCols, rows: buyRows },
              { name: 'Tool usage', columns: toolCols, rows: toolRows },
              { name: 'By van', columns: flatCols, rows: flatRows },
            ], [
              ['Company', meta.companyName], ['Report', meta.title], ['Period', periodText], ['Filters', meta.filtersText],
              ['Note', CURRENT_TECH_NOTE], ['Counting', 'Each transfer to a van counts once, even though the system logs it twice.'],
              ['Printed by', printedBy], ['Printed at', formatDateTime(new Date())],
            ])}>
            <FileSpreadsheet className="h-5 w-5 mr-2" /> Download Excel
          </Button>
        </div>
        <p className="text-sm text-gray-700 -mt-2">CSV has one row per tool per van. Excel has the "Buy one?" list, the per-tool summary and the per-van detail on separate sheets.</p>

        {loading || !usage ? (
          <div className="flex items-center justify-center gap-3 py-12 text-gray-700"><Loader2 className="h-6 w-6 animate-spin" /> Loading usage…</div>
        ) : (
          <>
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-lg font-bold"><ShoppingCart className="h-5 w-5" /> Buy one? <span className="font-normal text-gray-700">({buyOne.length})</span></h3>
              {buyOne.length === 0 ? (
                <p className="text-base text-gray-700">No van took the same tool {threshold} or more times in this period.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {buyOne.map((b) => (
                    <li key={`${b.vanLabel}|${b.toolName}`} className="flex items-center justify-between gap-3 px-3 py-3 text-base">
                      <span><strong>{b.vanLabel}</strong> / {techText(b.techs)}: {b.toolName}</span>
                      <span className="shrink-0 font-bold">× {b.trips} in {days} days</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-lg font-bold">By tool</h3>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Times out</TableHead>
                      <TableHead className="text-right">Vans</TableHead>
                      <TableHead className="text-right">Techs</TableHead>
                      <TableHead>Last out</TableHead>
                      <TableHead>Which van (current tech) × times</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tools.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-gray-700">No tools were sent out to vans{search || category !== 'all' ? ' matching these filters' : ''} in this period.</TableCell></TableRow>
                    ) : tools.map((t) => (
                      <TableRow key={t.toolKey}>
                        <TableCell className="font-medium">{t.toolName}{t.units !== t.trips && <span className="block text-sm font-normal text-gray-700">{t.units} units</span>}</TableCell>
                        <TableCell>{t.category}</TableCell>
                        <TableCell className="text-right font-semibold">{t.trips}</TableCell>
                        <TableCell className="text-right">{t.vanCount}</TableCell>
                        <TableCell className="text-right">{t.techCount}</TableCell>
                        <TableCell className="whitespace-nowrap">{new Date(t.lastOut).toLocaleDateString()}</TableCell>
                        <TableCell className="text-sm">
                          {t.byVan.map((v) => <span key={v.vanKey} className="mr-3 inline-block">{v.vanLabel} ({techText(v.techs)}) <strong>×{v.trips}</strong></span>)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        )}

        {printing && usage && (
          <PrintPortal landscape runningHeader={`${meta.companyName} — ${meta.title}`} runningHeaderRight={`Printed ${formatDateTime(meta.printedAt)}`}>
            <TableReportDocument meta={meta} notes={[CURRENT_TECH_NOTE, 'Each transfer to a van counts once, even though the system logs it twice.']} sections={sections} />
          </PrintPortal>
        )}
      </CardContent>
    </Card>
  );
};
