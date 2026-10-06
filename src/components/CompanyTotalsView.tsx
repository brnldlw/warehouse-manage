import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';
import { PrintPortal } from '@/components/print/PrintPortal';
import { ReportHeader } from '@/components/print/InventoryReportDocument';
import { ColorDot } from '@/components/ColorDot';
import { matchesSearch } from '@/lib/search';
import { ReportMeta, exportFileName, formatDateTime, formatMoney } from '@/lib/inventoryReport';
import {
  TotalsInput, TotalsSortKey, ToolTypeTotal, buildCompanyTotals, downloadTotalsCsv, downloadTotalsXlsx, grandTotal,
  locationsText, sortTotals,
} from '@/lib/companyTotals';

interface Props {
  items: TotalsInput[];
  search: string;
  colorSupported: boolean | null;
  companyName: string;
  printedBy: string;
  /** Other filters in effect (category, color), for the printed header. */
  filtersText: string;
}

const Dots: React.FC<{ r: ToolTypeTotal }> = ({ r }) =>
  r.colorValue ? <ColorDot color={r.colorValue} /> : <>{r.colors.map((c) => <ColorDot key={c} color={c} />)}</>;

const price = (v: number | null) => (v === null ? '—' : formatMoney(v));

/** Company totals: one row per kind of tool across the company. Read-only. */
export const CompanyTotalsView: React.FC<Props> = ({ items, search, colorSupported, companyName, printedBy, filtersText }) => {
  const [sort, setSort] = useState<{ key: TotalsSortKey; asc: boolean }>({ key: 'name', asc: true });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { printing, print } = usePrint();
  const withColor = !!colorSupported;

  const all = useMemo(() => buildCompanyTotals(items), [items]);
  const rows = useMemo(
    () => sortTotals(all.filter((r) => matchesSearch(search, r.name, r.category, r.color, ...r.colors)), sort.key, sort.asc),
    [all, search, sort],
  );
  const t = grandTotal(rows);
  const unpriced = rows.reduce((n, r) => n + r.unpriced, 0);

  const sortBy = (key: TotalsSortKey) =>
    setSort((s) => ({ key, asc: s.key === key ? !s.asc : !['total', 'warehouse', 'vans', 'avgPrice', 'totalValue'].includes(key) }));
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const meta: ReportMeta = {
    companyName,
    title: 'Company Tool Totals',
    filtersText: [search.trim() && `Search: "${search.trim()}"`, filtersText].filter(Boolean).join('  ·  '),
    printedBy,
    printedAt: new Date(),
  };
  const fileName = (ext: 'csv' | 'xlsx') => exportFileName(companyName, 'company-tool-totals', ext);

  const Head: React.FC<{ k: TotalsSortKey; children: React.ReactNode; right?: boolean }> = ({ k, children, right }) => (
    <TableHead className={right ? 'text-right' : undefined} aria-sort={sort.key === k ? (sort.asc ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => sortBy(k)}
        className={`flex min-h-[44px] items-center gap-1 font-semibold text-gray-900 ${right ? 'ml-auto' : ''}`}>
        {children}
        {sort.key !== k ? <ChevronsUpDown className="h-4 w-4 text-gray-500" /> : sort.asc ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
    </TableHead>
  );
  const cols = withColor ? 9 : 8;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span>Company totals ({rows.length} kinds of tools, {t.tools} tools)</span>
          <span className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-12 border-2 border-gray-800" onClick={print} disabled={!rows.length}>
              <Printer className="mr-2 h-5 w-5" /> Print
            </Button>
            <Button variant="outline" className="h-12 border-2 border-gray-800" disabled={!rows.length}
              onClick={() => downloadTotalsCsv(fileName('csv'), rows, withColor)}>
              <FileText className="mr-2 h-5 w-5" /> CSV
            </Button>
            <Button variant="outline" className="h-12 border-2 border-gray-800" disabled={!rows.length}
              onClick={() => downloadTotalsXlsx(fileName('xlsx'), { ...meta, printedAt: new Date() }, rows, withColor)}>
              <FileSpreadsheet className="mr-2 h-5 w-5" /> Excel
            </Button>
          </span>
        </CardTitle>
        <p className="text-sm text-gray-700">
          Tools with the same name (ignoring capitals and extra spaces) and the same category are counted together, wherever they are.
          Click a row to see every location. This view only reads; nothing can be changed here.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-10" />
                <Head k="name">Name</Head>
                <Head k="category">Category</Head>
                {withColor && <Head k="color">Color</Head>}
                <Head k="total" right>Total</Head>
                <Head k="warehouse" right>Warehouse</Head>
                <Head k="vans" right>On vans</Head>
                <Head k="avgPrice" right>Avg price</Head>
                <Head k="totalValue" right>Total value</Head>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={cols} className="py-8 text-center text-gray-700">{search ? 'No tools match your search.' : 'No tools.'}</TableCell></TableRow>
              )}
              {rows.map((r) => {
                const isOpen = open.has(r.key);
                return (
                  <React.Fragment key={r.key}>
                    <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => toggle(r.key)}>
                      <TableCell>
                        <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} locations for ${r.name}`}
                          className="flex h-11 w-11 items-center justify-center" onClick={(e) => { e.stopPropagation(); toggle(r.key); }}>
                          {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium"><span className="flex items-center gap-2"><Dots r={r} />{r.name}</span></TableCell>
                      <TableCell>{r.category}</TableCell>
                      {withColor && <TableCell>{r.color || '—'}</TableCell>}
                      <TableCell className="text-right font-semibold">{r.total}</TableCell>
                      <TableCell className="text-right">{r.warehouse}</TableCell>
                      <TableCell className="text-right">{r.vans}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{price(r.avgPrice)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {formatMoney(r.totalValue)}
                        {r.unpriced > 0 && <span className="block text-xs text-gray-600">{r.unpriced} without a price</span>}
                      </TableCell>
                    </TableRow>
                    {isOpen && r.locations.map((l) => (
                      <TableRow key={l.key} className="bg-gray-50">
                        <TableCell />
                        <TableCell colSpan={withColor ? 3 : 2} className="pl-8 text-sm">{l.label}</TableCell>
                        <TableCell className="text-right text-sm">{l.count}</TableCell>
                        <TableCell colSpan={4} />
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
              {rows.length > 0 && (
                <TableRow className="border-t-2 border-gray-800 font-bold">
                  <TableCell />
                  <TableCell colSpan={withColor ? 3 : 2}>Total{search ? ' (search results)' : ''}: {t.tools} tools</TableCell>
                  <TableCell className="text-right">{t.tools}</TableCell>
                  <TableCell className="text-right">{t.warehouse}</TableCell>
                  <TableCell className="text-right">{t.vans}</TableCell>
                  <TableCell />
                  <TableCell className="whitespace-nowrap text-right">{formatMoney(t.value)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {unpriced > 0 && (
          <p className="mt-2 text-sm text-gray-700">{unpriced} tool{unpriced === 1 ? ' has' : 's have'} no price; they count in the quantities but not in the average or value.</p>
        )}
      </CardContent>

      {printing && (
        <PrintPortal landscape runningHeader={`${companyName} — Company Tool Totals`} runningHeaderRight={`Printed ${formatDateTime(meta.printedAt)}`}>
          <div className="report-doc">
            <ReportHeader meta={meta} />
            <table className="report-table">
              <thead>
                <tr>
                  <th>Name</th><th>Category</th>{withColor && <th>Color</th>}
                  <th className="num">Total</th><th className="num">Warehouse</th><th className="num">On vans</th>
                  <th className="num">Avg price</th><th className="num">Total value</th><th>Locations</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.name}</td><td>{r.category}</td>{withColor && <td>{r.color}</td>}
                    <td className="num">{r.total}</td><td className="num">{r.warehouse}</td><td className="num">{r.vans}</td>
                    <td className="num">{price(r.avgPrice)}</td><td className="num">{formatMoney(r.totalValue)}</td>
                    <td>{locationsText(r)}</td>
                  </tr>
                ))}
                <tr className="report-total-row">
                  <td colSpan={withColor ? 3 : 2}>Grand total: {rows.length} kinds of tools</td>
                  <td className="num">{t.tools}</td><td className="num">{t.warehouse}</td><td className="num">{t.vans}</td>
                  <td /><td className="num">{formatMoney(t.value)}</td><td />
                </tr>
              </tbody>
            </table>
          </div>
        </PrintPortal>
      )}
    </Card>
  );
};
