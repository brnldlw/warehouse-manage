// "Company totals" on Manage Parts (admins): one line per kind of tool across the whole company,
// using the same "is this the same tool?" rule as Merge duplicates (same name ignoring capitals
// and extra spaces, same category). Read-only: nothing here writes to the database.

import * as XLSX from 'xlsx';
import { normalizeName } from '@/lib/toolMerge';
import { colorLabel } from '@/lib/toolColor';
import {
  MONEY_FORMAT, ReportMeta, downloadBlob, isWarehouseKey, formatDateTime, formatMoney, freezeTopRow, safeText,
} from '@/lib/inventoryReport';

export interface TotalsInput {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  color: string;
  /** Where it is now: a warehouse key (see isWarehouseKey) or a truck id. */
  locationKey: string;
  locationName: string;
  unitPrice: number | null;
}

export interface TotalsLocation { key: string; label: string; count: number }

export interface ToolTypeTotal {
  key: string;
  name: string;
  category: string;
  /** "Red", "Mixed" or ''. */
  color: string;
  /** The single color value when all tools share it ('' otherwise). */
  colorValue: string;
  /** Distinct color values, for the dots on a "Mixed" line. */
  colors: string[];
  total: number;
  warehouse: number;
  vans: number;
  /** Warehouse first, then vans A–Z. */
  locations: TotalsLocation[];
  /** Average of the known prices; null when no tool has a price. */
  avgPrice: number | null;
  /** Sum of the known prices. */
  totalValue: number;
  /** How many tools have no price (left out of the average and value). */
  unpriced: number;
}

export type TotalsSortKey = 'name' | 'category' | 'color' | 'total' | 'warehouse' | 'vans' | 'avgPrice' | 'totalValue';

const cmpText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || cmpText(a[0], b[0]))[0][0];
}

export function buildCompanyTotals(items: TotalsInput[]): ToolTypeTotal[] {
  const byType = new Map<string, TotalsInput[]>();
  for (const i of items) {
    const key = `${normalizeName(i.name)}|${i.categoryId ?? ''}`;
    const list = byType.get(key);
    if (list) list.push(i); else byType.set(key, [i]);
  }
  return [...byType].map(([key, list]) => {
    const locs = new Map<string, TotalsLocation>();
    for (const i of list) {
      const l = locs.get(i.locationKey);
      if (l) l.count++; else locs.set(i.locationKey, { key: i.locationKey, label: i.locationName, count: 1 });
    }
    const prices = list.map((i) => i.unitPrice).filter((p): p is number => p !== null && Number.isFinite(p));
    const colors = [...new Set(list.map((i) => i.color || ''))];
    // Each warehouse is its own location line; "in warehouses" adds them all up.
    const warehouse = [...locs.values()].filter((l) => isWarehouseKey(l.key)).reduce((n, l) => n + l.count, 0);
    return {
      key,
      // The spelling most of the tools use ("Cordless Drill", not "cordless  drill").
      name: mostCommon(list.map((i) => i.name.trim().replace(/\s+/g, ' '))),
      category: list[0].categoryName,
      color: colors.length === 1 ? colorLabel(colors[0]) : 'Mixed',
      colorValue: colors.length === 1 ? colors[0] : '',
      colors: colors.filter(Boolean).sort(),
      total: list.length,
      warehouse,
      vans: list.length - warehouse,
      locations: [...locs.values()].sort((a, b) => Number(!isWarehouseKey(a.key)) - Number(!isWarehouseKey(b.key)) || cmpText(a.label, b.label)),
      avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
      totalValue: prices.reduce((a, b) => a + b, 0),
      unpriced: list.length - prices.length,
    };
  });
}

export function sortTotals(rows: ToolTypeTotal[], key: TotalsSortKey, asc: boolean): ToolTypeTotal[] {
  const dir = asc ? 1 : -1;
  const num = (v: number | null) => (v === null ? -Infinity : v);
  return [...rows].sort((a, b) => {
    let d: number;
    switch (key) {
      case 'category': d = cmpText(a.category, b.category); break;
      case 'color': d = cmpText(a.color || '~', b.color || '~'); break; // no color sorts last A–Z
      case 'total': d = a.total - b.total; break;
      case 'warehouse': d = a.warehouse - b.warehouse; break;
      case 'vans': d = a.vans - b.vans; break;
      case 'avgPrice': d = num(a.avgPrice) - num(b.avgPrice); break;
      case 'totalValue': d = a.totalValue - b.totalValue; break;
      default: d = 0;
    }
    return dir * d || cmpText(a.name, b.name) || cmpText(a.category, b.category);
  });
}

export const grandTotal = (rows: ToolTypeTotal[]) => ({
  tools: rows.reduce((n, r) => n + r.total, 0),
  warehouse: rows.reduce((n, r) => n + r.warehouse, 0),
  vans: rows.reduce((n, r) => n + r.vans, 0),
  value: rows.reduce((n, r) => n + r.totalValue, 0),
});

/** "Warehouse 3 · Van 7 (HVAC-7) 2" */
export const locationsText = (r: ToolTypeTotal) => r.locations.map((l) => `${l.label} ${l.count}`).join(' · ');

const HEADER = ['Name', 'Category', 'Color', 'Total Qty', 'In Warehouse', 'On Vans', 'Avg Unit Price', 'Total Value', 'Locations'];
const rowValues = (r: ToolTypeTotal, withColor: boolean): (string | number | null)[] => {
  const v: (string | number | null)[] = [safeText(r.name), safeText(r.category), r.color, r.total, r.warehouse, r.vans,
    r.avgPrice === null ? null : Math.round(r.avgPrice * 100) / 100, Math.round(r.totalValue * 100) / 100, safeText(locationsText(r))];
  return withColor ? v : v.filter((_, i) => i !== 2);
};
const header = (withColor: boolean) => (withColor ? HEADER : HEADER.filter((h) => h !== 'Color'));

export function downloadTotalsCsv(fileName: string, rows: ToolTypeTotal[], withColor: boolean) {
  const quote = (v: string | number | null) => {
    if (v === null) return '';
    if (typeof v === 'number') return String(v);
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [header(withColor).map(quote).join(','), ...rows.map((r) => rowValues(r, withColor).map(quote).join(','))];
  downloadBlob(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), fileName);
}

export function downloadTotalsXlsx(fileName: string, meta: ReportMeta, rows: ToolTypeTotal[], withColor: boolean) {
  const head = header(withColor);
  const aoa: (string | number | null)[][] = [head, ...rows.map((r) => rowValues(r, withColor))];
  const lastDataRow = aoa.length;
  const t = grandTotal(rows);
  const total: (string | number | null)[] = head.map(() => null);
  total[0] = 'GRAND TOTAL';
  total[head.indexOf('Total Qty')] = t.tools;
  total[head.indexOf('In Warehouse')] = t.warehouse;
  total[head.indexOf('On Vans')] = t.vans;
  total[head.indexOf('Total Value')] = Math.round(t.value * 100) / 100;
  aoa.push([], total);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = head.map((h) => ({ wch: h === 'Name' ? 34 : h === 'Locations' ? 60 : h === 'Category' ? 18 : 13 }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastDataRow - 1, c: head.length - 1 } }) };
  for (const h of ['Avg Unit Price', 'Total Value']) {
    const c = head.indexOf(h);
    for (let r = 1; r < aoa.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = MONEY_FORMAT;
    }
  }
  const info = XLSX.utils.aoa_to_sheet([
    ['Company', meta.companyName], ['Report', meta.title], ['Filters', meta.filtersText],
    ['Printed by', meta.printedBy], ['Printed at', formatDateTime(meta.printedAt)], [],
    ['Kinds of tools', rows.length], ['Total tools', t.tools], ['Total value', formatMoney(t.value)],
  ]);
  info['!cols'] = [{ wch: 18 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Company totals');
  XLSX.utils.book_append_sheet(wb, info, 'Details');
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(new Blob([freezeTopRow(bytes, 1)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}
