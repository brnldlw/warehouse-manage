import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePrint } from '@/hooks/use-print';
import { PrintPortal } from '@/components/print/PrintPortal';
import { InventoryReportDocument } from '@/components/print/InventoryReportDocument';
import { VanSheet, VanToolSheets } from '@/components/print/VanToolSheets';
import {
  ALL_COLUMN_KEYS, COLUMNS, ColumnKey, Detail, GroupBy, ReportData, ReportMeta, SortBy, WAREHOUSE,
  buildRows, conditionLabel, downloadCsv, downloadXlsx, exportFileName, formatDateTime, groupRows, loadReportData,
  sortRows, truckLabel,
} from '@/lib/inventoryReport';
import { ClipboardCheck, FileSpreadsheet, FileText, List, Loader2, Printer } from 'lucide-react';
import { SearchBox } from '@/components/SearchBox';
import { matchesSearch } from '@/lib/search';

type ReportType = 'list' | 'vanSheet';

const CONDITIONS = ['good', 'fair', 'poor', 'damaged'];

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-semibold text-gray-900">{label}</Label>
    {children}
  </div>
);

const Choice: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ value, onChange, options }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
    <SelectContent>
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value} className="py-3 text-base">{o.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const PrintInventory: React.FC = () => {
  const { userProfile, user } = useAuth();
  const { toast } = useToast();
  const { printing, print } = usePrint();

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const [reportType, setReportType] = useState<ReportType>('list');
  const [location, setLocation] = useState('all'); // all | warehouse | vans | <truck id>
  const [category, setCategory] = useState('all');
  const [condition, setCondition] = useState('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('location');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [detail, setDetail] = useState<Detail>('summary');
  const [columns, setColumns] = useState<ColumnKey[]>(ALL_COLUMN_KEYS);
  const [landscape, setLandscape] = useState(true);
  const [van, setVan] = useState('all'); // van sheet: all | <truck id>
  const [search, setSearch] = useState('');

  const companyId = userProfile?.company_id;

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    loadReportData(companyId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => {
        console.error('Error loading report data:', err);
        toast({ title: 'Error', description: 'Could not load inventory for printing.', variant: 'destructive' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, toast]);

  const printedBy = [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ') || userProfile?.email || user?.email || '';

  // ---- inventory list ----
  const listGroups = useMemo(() => {
    if (!data) return [];
    const items = data.items.filter((i) =>
      (location === 'all' ||
        (location === 'warehouse' && i.locationKey === WAREHOUSE) ||
        (location === 'vans' && i.locationKey !== WAREHOUSE) ||
        i.locationKey === location) &&
      (category === 'all' || (category === 'none' ? !i.categoryId : i.categoryId === category)) &&
      (condition === 'all' || i.condition === condition) &&
      matchesSearch(search, i.name, i.serial, i.barcode, i.categoryName, i.locationName));
    return groupRows(sortRows(buildRows(items, detail), sortBy), groupBy);
  }, [data, location, category, condition, detail, sortBy, groupBy, search]);

  const truckById = useMemo(() => new Map((data?.trucks ?? []).map((t) => [t.id, t])), [data]);
  const locationText =
    location === 'all' ? 'All locations'
    : location === 'warehouse' ? 'Warehouse'
    : location === 'vans' ? 'All vans'
    : truckById.get(location) ? truckLabel(truckById.get(location)!) : 'Van';
  const categoryText =
    category === 'all' ? 'All' : category === 'none' ? 'Uncategorized' : data?.categories.find((c) => c.id === category)?.name ?? '';

  const listMeta: ReportMeta = {
    companyName: data?.companyName ?? '',
    title: 'Inventory Report',
    filtersText: [
      ...(search.trim() ? [`Search: "${search.trim()}"`] : []),
      `Location: ${locationText}`,
      `Category: ${categoryText}`,
      `Condition: ${condition === 'all' ? 'All' : conditionLabel(condition)}`,
      `Grouped by: ${groupBy === 'none' ? 'None' : groupBy}`,
      `Sorted by: ${sortBy}`,
      detail === 'summary' ? 'Summary (one line per tool type)' : 'Detailed (one line per tool)',
    ].join('  ·  '),
    printedBy,
    printedAt: new Date(),
  };

  // ---- van tool sheets ----
  const vanSheets: VanSheet[] = useMemo(() => {
    if (!data) return [];
    const trucks = van === 'all' ? data.trucks : data.trucks.filter((t) => t.id === van);
    return trucks.map((t) => ({
      id: t.id,
      label: truckLabel(t),
      techs: data.truckTechs[t.id] ?? [],
      rows: sortRows(buildRows(data.items.filter((i) => i.locationKey === t.id), detail), sortBy === 'location' ? 'name' : sortBy),
    }));
  }, [data, van, detail, sortBy]);

  const vanMeta: ReportMeta = { ...listMeta, title: 'Van Tool Sheet', filtersText: '' };

  const toggleColumn = (key: ColumnKey, on: boolean) =>
    setColumns((prev) => (on ? ALL_COLUMN_KEYS.filter((k) => k === key || prev.includes(k)) : prev.filter((k) => k !== key)));

  const exportName = (ext: 'csv' | 'xlsx') => exportFileName(listMeta.companyName, 'inventory', ext);

  const switchType = (t: ReportType) => {
    setReportType(t);
    setLandscape(t === 'list');
    if (t === 'vanSheet' && sortBy === 'location') setSortBy('name');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-gray-700">
        <Loader2 className="h-6 w-6 animate-spin" /> Loading inventory…
      </div>
    );
  }

  const bigButton = 'h-14 px-6 text-base font-semibold';
  const isList = reportType === 'list';
  const listCount = listGroups.reduce((n, g) => n + g.quantity, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Printer className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Print Inventory</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          variant={isList ? 'default' : 'outline'}
          className={`${bigButton} ${isList ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'border-2 border-gray-800 text-gray-900'}`}
          onClick={() => switchType('list')}
        >
          <List className="h-5 w-5 mr-2" /> Inventory list
        </Button>
        <Button
          variant={!isList ? 'default' : 'outline'}
          className={`${bigButton} ${!isList ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'border-2 border-gray-800 text-gray-900'}`}
          onClick={() => switchType('vanSheet')}
        >
          <ClipboardCheck className="h-5 w-5 mr-2" /> Van tool sheet
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Options</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {isList && (
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search name, serial, barcode, category or van…"
              shown={listCount}
              total={data?.items.length ?? 0}
              noun="tools"
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isList ? (
              <>
                <Field label="Location">
                  <Choice value={location} onChange={setLocation} options={[
                    { value: 'all', label: 'All locations' },
                    { value: 'warehouse', label: 'Warehouse' },
                    { value: 'vans', label: 'All vans' },
                    ...(data?.trucks ?? []).map((t) => ({ value: t.id, label: truckLabel(t) })),
                  ]} />
                </Field>
                <Field label="Category">
                  <Choice value={category} onChange={setCategory} options={[
                    { value: 'all', label: 'All categories' },
                    ...(data?.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
                    { value: 'none', label: 'Uncategorized' },
                  ]} />
                </Field>
                <Field label="Condition">
                  <Choice value={condition} onChange={setCondition} options={[
                    { value: 'all', label: 'All conditions' },
                    ...CONDITIONS.map((c) => ({ value: c, label: conditionLabel(c) })),
                  ]} />
                </Field>
                <Field label="Group by">
                  <Choice value={groupBy} onChange={(v) => setGroupBy(v as GroupBy)} options={[
                    { value: 'location', label: 'Location / van' },
                    { value: 'category', label: 'Category' },
                    { value: 'none', label: 'No grouping' },
                  ]} />
                </Field>
              </>
            ) : (
              <Field label="Van">
                <Choice value={van} onChange={setVan} options={[
                  { value: 'all', label: `All vans (${data?.trucks.length ?? 0}, one page each)` },
                  ...(data?.trucks ?? []).map((t) => ({ value: t.id, label: truckLabel(t) })),
                ]} />
              </Field>
            )}
            <Field label="Sort by">
              <Choice value={sortBy} onChange={(v) => setSortBy(v as SortBy)} options={[
                { value: 'name', label: 'Name' },
                { value: 'category', label: 'Category' },
                ...(isList ? [{ value: 'location', label: 'Location' }] : []),
              ]} />
            </Field>
            <Field label="Detail level">
              <Choice value={detail} onChange={(v) => setDetail(v as Detail)} options={[
                { value: 'summary', label: 'Summary (tool type + qty)' },
                { value: 'detailed', label: 'Detailed (each tool + serial #)' },
              ]} />
            </Field>
            <Field label="Page orientation">
              <Choice value={landscape ? 'landscape' : 'portrait'} onChange={(v) => setLandscape(v === 'landscape')} options={[
                { value: 'landscape', label: 'Landscape (wide)' },
                { value: 'portrait', label: 'Portrait (tall)' },
              ]} />
            </Field>
          </div>

          {isList && (
            <Field label="Columns">
              <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
                {COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-base cursor-pointer min-h-[44px]">
                    <Checkbox
                      className="h-6 w-6"
                      checked={columns.includes(c.key)}
                      disabled={columns.length === 1 && columns.includes(c.key)}
                      onCheckedChange={(on) => toggleColumn(c.key, on === true)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </Field>
          )}

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2">
            <Button className={`${bigButton} bg-blue-700 hover:bg-blue-800 text-white`} onClick={print}>
              <Printer className="h-5 w-5 mr-2" />
              {isList ? 'Print' : van === 'all' ? 'Print all vans' : 'Print van sheet'}
            </Button>
            {isList && (
              <>
                <Button
                  variant="outline"
                  className={`${bigButton} border-2 border-gray-800 text-gray-900`}
                  onClick={() => downloadCsv(exportName('csv'), columns, listGroups, groupBy)}
                >
                  <FileText className="h-5 w-5 mr-2" /> Download CSV
                </Button>
                <Button
                  variant="outline"
                  className={`${bigButton} border-2 border-gray-800 text-gray-900`}
                  onClick={() => downloadXlsx(exportName('xlsx'), { ...listMeta, printedAt: new Date() }, columns, listGroups, groupBy)}
                >
                  <FileSpreadsheet className="h-5 w-5 mr-2" /> Download Excel
                </Button>
              </>
            )}
          </div>
          <p className="text-sm text-gray-700">
            To make a PDF: click Print, then choose <strong>Save as PDF</strong> as the printer.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Preview {isList ? `— ${listCount} tool${listCount === 1 ? '' : 's'}` : `— ${vanSheets.length} van${vanSheets.length === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto border-2 border-gray-300 rounded-md bg-white p-4 sm:p-8 max-h-[70vh] overflow-y-auto">
            <div className={landscape ? 'min-w-[900px]' : 'min-w-[640px] max-w-[800px]'}>
              {isList
                ? <InventoryReportDocument meta={listMeta} columns={columns} groups={listGroups} />
                : <VanToolSheets meta={vanMeta} vans={vanSheets} />}
            </div>
          </div>
        </CardContent>
      </Card>

      {printing && (
        <PrintPortal
          landscape={landscape}
          runningHeader={`${listMeta.companyName} — ${isList ? listMeta.title : vanMeta.title}`}
          runningHeaderRight={`Printed ${formatDateTime(listMeta.printedAt)}`}
        >
          {isList
            ? <InventoryReportDocument meta={listMeta} columns={columns} groups={listGroups} />
            : <VanToolSheets meta={vanMeta} vans={vanSheets} />}
        </PrintPortal>
      )}
    </div>
  );
};

export default PrintInventory;
