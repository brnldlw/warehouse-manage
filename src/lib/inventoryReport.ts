// Inventory reports: load the company's tools, shape them into rows/groups,
// and export them to CSV or Excel. Used by the Print Inventory page and the
// Print/Export buttons on the Manage Parts screen. Read-only: no writes.

import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { formatPurchaseDate, poColumnsAvailable } from '@/lib/poSupport';
import { colorColumnAvailable, colorLabel } from '@/lib/toolColor';
import { Warehouse, loadWarehouses, warehousesAvailable } from '@/lib/warehouses';

export type Condition = 'good' | 'fair' | 'poor' | 'damaged';
export type ColumnKey =
  | 'name' | 'category' | 'color' | 'serial' | 'barcode' | 'poNumber' | 'purchaseDate' | 'condition' | 'location'
  | 'warehouse' | 'quantity' | 'unitValue' | 'totalValue';
export type GroupBy = 'none' | 'location' | 'category' | 'warehouse';
export type SortBy = 'name' | 'category' | 'location';
export type Detail = 'summary' | 'detailed';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  numeric?: boolean;
  /** Excel column width, in characters. */
  width: number;
}

export const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', width: 34 },
  { key: 'category', label: 'Category', width: 18 },
  { key: 'color', label: 'Color', width: 10 },
  { key: 'serial', label: 'Serial #', width: 18 },
  { key: 'barcode', label: 'Barcode', width: 18 },
  { key: 'poNumber', label: 'PO #', width: 16 },
  { key: 'purchaseDate', label: 'Purchase Date', width: 14 },
  { key: 'condition', label: 'Condition', width: 11 },
  { key: 'location', label: 'Location / Van', width: 24 },
  { key: 'warehouse', label: 'Home Warehouse', width: 22 },
  { key: 'quantity', label: 'Qty', numeric: true, width: 7 },
  { key: 'unitValue', label: 'Unit Value', numeric: true, width: 12 },
  { key: 'totalValue', label: 'Total Value', numeric: true, width: 14 },
];
export const ALL_COLUMN_KEYS = COLUMNS.map((c) => c.key);
export const PO_COLUMN_KEYS: ColumnKey[] = ['poNumber', 'purchaseDate'];
export const COLOR_COLUMN_KEYS: ColumnKey[] = ['color'];
export const WAREHOUSE_COLUMN_KEYS: ColumnKey[] = ['warehouse'];
/** Printed by default: everything except the PO, color and warehouse columns, which are optional. */
export const DEFAULT_PRINT_COLUMN_KEYS = ALL_COLUMN_KEYS.filter((k) =>
  !PO_COLUMN_KEYS.includes(k) && !COLOR_COLUMN_KEYS.includes(k) && !WAREHOUSE_COLUMN_KEYS.includes(k));
/** Columns for exports: all of them, leaving out PO / color / warehouse columns until the database has them. */
export const exportColumnKeys = (poSupported: boolean | null, colorSupported: boolean | null = false, warehouseSupported: boolean | null = false) =>
  ALL_COLUMN_KEYS.filter((k) => (poSupported || !PO_COLUMN_KEYS.includes(k)) && (colorSupported || !COLOR_COLUMN_KEYS.includes(k))
    && (warehouseSupported || !WAREHOUSE_COLUMN_KEYS.includes(k)));
export const columnDefs = (keys: ColumnKey[]) => COLUMNS.filter((c) => keys.includes(c.key));

/** One physical tool (one inventory_items row). */
export interface ReportItem {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  serial: string;
  barcode: string;
  condition: string;
  /** Where it is now: WAREHOUSE (one unnamed warehouse), 'wh:<warehouse id>', or the truck id. */
  locationKey: string;
  locationName: string;
  /** The warehouse it belongs to (migration 006), even while on a van. */
  homeWarehouseId?: string | null;
  homeWarehouse?: string;
  /** The warehouse it is physically in (only while in a warehouse). */
  currentWarehouseId?: string | null;
  unitPrice: number | null;
  groupId: string | null;
  imageUrl?: string | null;
  /** '' when not recorded (or the database doesn't have PO columns yet). */
  poNumber?: string;
  /** "YYYY-MM-DD" or ''. */
  purchaseDate?: string;
  /** 'red', 'blue', … or '' (none, or the database has no color column yet). */
  color?: string;
}

/** One printed line: a single tool (detailed) or several identical tools (summary). */
export interface ReportRow {
  key: string;
  /** The tools (inventory_items ids) this line stands for. */
  itemIds: string[];
  name: string;
  imageUrl?: string | null;
  categoryId: string | null;
  category: string;
  serial: string;
  barcode: string;
  condition: string;
  locationKey: string;
  location: string;
  quantity: number;
  /** null when unknown or when the tools in a summary line have different prices. */
  unitValue: number | null;
  unitValueVaries: boolean;
  totalValue: number | null;
  /** One PO, or "PO1, PO2 +3 more" for a summary line. */
  poNumber: string;
  /** "YYYY-MM-DD", "Several" or ''. */
  purchaseDate: string;
  /** "Red", "Mixed" or ''. */
  color: string;
  /** The color value when every tool in the line has the same one ('' otherwise). */
  colorValue: string;
  /** Home warehouse name, "Mixed" or ''. */
  warehouse: string;
  /** Home warehouse id when every tool in the line shares it ('' otherwise). */
  warehouseId: string;
}

export interface ReportGroup {
  key: string;
  /** null when not grouping. */
  label: string | null;
  rows: ReportRow[];
  quantity: number;
  value: number;
}

export interface TruckInfo {
  id: string;
  name: string;
  identifier: string;
}

export interface ReportData {
  companyName: string;
  items: ReportItem[];
  categories: { id: string; name: string }[];
  trucks: TruckInfo[];
  /** Active techs assigned to each truck, by truck id. */
  truckTechs: Record<string, string[]>;
  /** [] until migration 006 has run. */
  warehouses: Warehouse[];
}

export interface ReportMeta {
  companyName: string;
  title: string;
  filtersText: string;
  printedBy: string;
  printedAt: Date;
}

export const WAREHOUSE = 'warehouse';
export const UNCATEGORIZED = 'Uncategorized';
/** locationKey of a tool in one of several named warehouses. */
export const warehouseKey = (warehouseId: string) => `wh:${warehouseId}`;
/** Is this locationKey a warehouse (the single unnamed one, or a named one)? */
export const isWarehouseKey = (k: string) => k === WAREHOUSE || k.startsWith('wh:');

export const conditionLabel = (c: string) => (c ? c.charAt(0).toUpperCase() + c.slice(1) : '');
export const truckLabel = (t: TruckInfo) => (t.identifier ? `${t.name} (${t.identifier})` : t.name);

// ---------- loading ----------

const ITEM_COLUMNS = 'id, name, category_id, serial_number, barcode, condition, location_type, assigned_truck_id, unit_price, group_id, image_url';

/** Ask for the PO / color / warehouse columns only when the database has them (migrations 003, 004, 006). */
const itemColumns = async (): Promise<string> => {
  const [po, color, wh] = await Promise.all([poColumnsAvailable(), colorColumnAvailable(), warehousesAvailable()]);
  return [ITEM_COLUMNS, po ? 'po_number, purchase_date' : '', color ? 'color' : '', wh ? 'home_warehouse_id, current_warehouse_id' : '']
    .filter(Boolean).join(', ');
};

/** One inventory_items row -> ReportItem. */
export function toReportItem(
  r: Record<string, unknown>, categoryName: Map<string, string>, truckById: Map<string, TruckInfo>,
  warehouseById: Map<string, Warehouse> = new Map(),
): ReportItem {
  const truckId = (r.assigned_truck_id as string | null) ?? null;
  const onTruck = r.location_type === 'truck' && truckId;
  const truck = onTruck ? truckById.get(truckId) : undefined;
  const price = r.unit_price === null || r.unit_price === undefined ? null : Number(r.unit_price);
  const homeId = (r.home_warehouse_id as string | null) ?? null;
  const currentId = onTruck ? null : (r.current_warehouse_id as string | null) ?? homeId;
  const current = currentId ? warehouseById.get(currentId) : undefined;
  return {
    homeWarehouseId: homeId,
    homeWarehouse: homeId ? warehouseById.get(homeId)?.name ?? '' : '',
    currentWarehouseId: currentId,
    id: r.id as string,
    name: ((r.name as string) ?? '').trim(),
    categoryId: (r.category_id as string | null) ?? null,
    categoryName: categoryName.get(r.category_id as string) ?? UNCATEGORIZED,
    serial: (r.serial_number as string) ?? '',
    barcode: (r.barcode as string) ?? '',
    condition: (r.condition as string) || 'good',
    locationKey: onTruck ? truckId : current ? warehouseKey(current.id) : WAREHOUSE,
    locationName: onTruck ? (truck ? truckLabel(truck) : 'Unknown van') : current ? current.name : 'Warehouse',
    unitPrice: Number.isFinite(price) ? price : null,
    groupId: (r.group_id as string | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    poNumber: ((r.po_number as string | null) ?? '').trim(),
    purchaseDate: (r.purchase_date as string | null) ?? '',
    color: ((r.color as string | null) ?? '').toLowerCase(),
  };
}

export async function loadCompanyName(companyId: string): Promise<string> {
  const { data } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle();
  return (data?.name as string) ?? '';
}

/** Every tool currently on one van (this company only). */
export async function loadVanItems(companyId: string, truck: TruckInfo): Promise<ReportItem[]> {
  const cols = await itemColumns();
  const [categories, rawItems, warehouses] = await Promise.all([
    fetchAll(() => supabase.from('categories').select('id, name').eq('company_id', companyId).order('id')),
    fetchAll<Record<string, unknown>>(() => supabase
      .from('inventory_items')
      .select(cols)
      .eq('company_id', companyId)
      .eq('location_type', 'truck')
      .eq('assigned_truck_id', truck.id)
      .order('id')
      .returns<Record<string, unknown>[]>()),
    loadWarehouses(companyId).catch(() => [] as Warehouse[]),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id as string, c.name as string]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  return rawItems.map((r) => toReportItem(r, categoryName, new Map([[truck.id, truck]]), warehouseById));
}

/** Everything a report needs, limited to one company (RLS enforces this too). */
export async function loadReportData(companyId: string): Promise<ReportData> {
  const cols = await itemColumns();
  const [company, categories, trucks, assignments, rawItems, warehouses] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).single(),
    fetchAll(() => supabase.from('categories').select('id, name').eq('company_id', companyId).order('name').order('id')),
    fetchAll(() => supabase.from('trucks').select('id, name, identifier').eq('company_id', companyId).order('name').order('id')),
    // Best effort: the report still works without tech names.
    fetchAll(() => supabase.from('user_truck_assignments').select('user_id, truck_id').eq('company_id', companyId).order('id'))
      .catch((err) => { console.error('Could not load van assignments:', err); return []; }),
    fetchAll<Record<string, unknown>>(() => supabase
      .from('inventory_items')
      .select(cols)
      .eq('company_id', companyId)
      .order('id')
      .returns<Record<string, unknown>[]>()),
    loadWarehouses(companyId).catch((err) => { console.error('Could not load warehouses:', err); return [] as Warehouse[]; }),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id as string, c.name as string]));
  const truckList: TruckInfo[] = trucks.map((t) => ({ id: t.id, name: t.name, identifier: t.identifier ?? '' }));
  const truckById = new Map(truckList.map((t) => [t.id, t]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const items = rawItems.map((r) => toReportItem(r, categoryName, truckById, warehouseById));

  // Tech names per van (best effort: the report still works without them).
  const truckTechs: Record<string, string[]> = {};
  const userIds = [...new Set(assignments.map((a) => a.user_id as string))];
  if (userIds.length) {
    const { data: people } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name, email, is_active')
      .eq('company_id', companyId)
      .in('id', userIds);
    const nameById = new Map(
      (people ?? [])
        .filter((p) => p.is_active !== false)
        .map((p) => [p.id as string, [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email as string) || 'Unnamed']),
    );
    for (const a of assignments) {
      const name = nameById.get(a.user_id as string);
      if (name && a.truck_id) (truckTechs[a.truck_id as string] ??= []).push(name);
    }
  }

  return {
    companyName: (company.data?.name as string) ?? '',
    items,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    trucks: truckList,
    truckTechs,
    warehouses,
  };
}

// ---------- shaping ----------

/** Collapse tools into one line. Fields that differ between them are shown as mixed. */
export function summarizeItems(items: ReportItem[], key: string): ReportRow {
  const first = items[0];
  const same = <T,>(pick: (i: ReportItem) => T) => items.every((i) => pick(i) === pick(first));
  const prices = items.map((i) => i.unitPrice).filter((p): p is number => p !== null);
  const pricesSame = prices.length === items.length && same((i) => i.unitPrice);
  return {
    key,
    itemIds: items.map((i) => i.id),
    name: first.name,
    imageUrl: items.find((i) => i.imageUrl)?.imageUrl ?? null,
    categoryId: first.categoryId,
    category: first.categoryName,
    serial: items.length === 1 ? first.serial : '',
    barcode: items.length === 1 ? first.barcode : '',
    condition: same((i) => i.condition) ? conditionLabel(first.condition) : 'Mixed',
    locationKey: first.locationKey,
    location: first.locationName,
    quantity: items.length,
    unitValue: pricesSame ? first.unitPrice : null,
    unitValueVaries: prices.length > 0 && !pricesSame,
    totalValue: prices.length ? prices.reduce((a, b) => a + b, 0) : null,
    poNumber: listDistinct(items.map((i) => i.poNumber ?? '')),
    purchaseDate: (() => {
      const dates = [...new Set(items.map((i) => i.purchaseDate ?? '').filter(Boolean))];
      return dates.length === 1 ? dates[0] : dates.length > 1 ? 'Several' : '';
    })(),
    color: same((i) => i.color ?? '') ? colorLabel(first.color) : 'Mixed',
    colorValue: same((i) => i.color ?? '') ? first.color ?? '' : '',
    warehouse: same((i) => i.homeWarehouseId ?? '') ? first.homeWarehouse ?? '' : 'Mixed',
    warehouseId: same((i) => i.homeWarehouseId ?? '') ? first.homeWarehouseId ?? '' : '',
  };
}

/** "PO-1, PO-2, PO-3 +2 more" (blank values ignored). */
function listDistinct(values: string[], max = 3): string {
  const distinct = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return distinct.slice(0, max).join(', ') + (distinct.length > max ? ` +${distinct.length - max} more` : '');
}

export function buildRows(items: ReportItem[], detail: Detail): ReportRow[] {
  if (detail === 'detailed') return items.map((i) => summarizeItems([i], i.id));
  // Summary: one line per tool type (same name + category) at each location, and per home
  // warehouse, so every line can show which warehouse its tools belong to.
  const byType = new Map<string, ReportItem[]>();
  for (const i of items) {
    const key = `${i.name.toLowerCase()}|${i.categoryId ?? ''}|${i.locationKey}|${i.homeWarehouseId ?? ''}`;
    const list = byType.get(key);
    if (list) list.push(i);
    else byType.set(key, [i]);
  }
  return [...byType].map(([key, list]) => summarizeItems(list, key));
}

type Compare = (a: ReportRow, b: ReportRow) => number;
const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const byText = (f: (r: ReportRow) => string): Compare => (a, b) => cmp(f(a), f(b));
const byName = byText((r) => r.name);
// Warehouses before vans; Uncategorized after real categories; no home warehouse last.
const byLocation: Compare = (a, b) =>
  Number(!isWarehouseKey(a.locationKey)) - Number(!isWarehouseKey(b.locationKey)) || cmp(a.location, b.location);
const byWarehouse: Compare = (a, b) => Number(!a.warehouse) - Number(!b.warehouse) || cmp(a.warehouse, b.warehouse);
const byCategory: Compare = (a, b) => Number(!a.categoryId) - Number(!b.categoryId) || cmp(a.category, b.category);

export function sortRows(rows: ReportRow[], sortBy: SortBy): ReportRow[] {
  const order: Compare[] =
    sortBy === 'category' ? [byCategory, byName, byLocation]
    : sortBy === 'location' ? [byLocation, byName]
    : [byName, byLocation];
  order.push(byText((r) => r.serial), byText((r) => r.barcode));
  return [...rows].sort((a, b) => {
    for (const f of order) {
      const d = f(a, b);
      if (d) return d;
    }
    return 0;
  });
}

const sumQty = (rows: ReportRow[]) => rows.reduce((n, r) => n + r.quantity, 0);
const sumValue = (rows: ReportRow[]) => rows.reduce((n, r) => n + (r.totalValue ?? 0), 0);

/** Split already-sorted rows into groups; row order inside each group is kept. */
export function groupRows(rows: ReportRow[], groupBy: GroupBy): ReportGroup[] {
  if (groupBy === 'none') return [{ key: 'all', label: null, rows, quantity: sumQty(rows), value: sumValue(rows) }];
  const keyOf = groupBy === 'location' ? (r: ReportRow) => r.locationKey
    : groupBy === 'warehouse' ? (r: ReportRow) => r.warehouseId || r.warehouse
    : (r: ReportRow) => r.categoryId ?? '';
  const labelOf = groupBy === 'location' ? (r: ReportRow) => r.location
    : groupBy === 'warehouse' ? (r: ReportRow) => (r.warehouse ? `Home: ${r.warehouse}` : 'No home warehouse')
    : (r: ReportRow) => r.category;
  const orderOf = groupBy === 'location' ? byLocation : groupBy === 'warehouse' ? byWarehouse : byCategory;
  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const k = keyOf(r);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { key: k, label: labelOf(r), rows: [], quantity: 0, value: 0 }));
    g.rows.push(r);
  }
  const list = [...groups.values()];
  for (const g of list) { g.quantity = sumQty(g.rows); g.value = sumValue(g.rows); }
  return list.sort((a, b) => orderOf(a.rows[0], b.rows[0]));
}

export const grandTotals = (groups: ReportGroup[]) => ({
  quantity: groups.reduce((n, g) => n + g.quantity, 0),
  value: groups.reduce((n, g) => n + g.value, 0),
});

// ---------- formatting ----------

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatMoney = (n: number) => money.format(n);
export const formatDateTime = (d: Date) =>
  d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Text shown in a printed cell. */
export function cellText(row: ReportRow, key: ColumnKey): string {
  switch (key) {
    case 'purchaseDate': return /^\d{4}-\d{2}-\d{2}$/.test(row.purchaseDate) ? formatPurchaseDate(row.purchaseDate) : row.purchaseDate;
    case 'quantity': return String(row.quantity);
    case 'unitValue': return row.unitValue !== null ? formatMoney(row.unitValue) : row.unitValueVaries ? 'varies' : '';
    case 'totalValue': return row.totalValue !== null ? formatMoney(row.totalValue) : '';
    default: return row[key];
  }
}

/** Raw cell value for CSV/Excel (numbers stay numbers). */
function cellValue(row: ReportRow, key: ColumnKey): string | number | null {
  switch (key) {
    case 'quantity': return row.quantity;
    case 'unitValue': return row.unitValue;
    case 'totalValue': return row.totalValue;
    default: return row[key];
  }
}

// ---------- export ----------

const groupColumnLabel = (groupBy: GroupBy) => (groupBy === 'location' ? 'Group: Location' : groupBy === 'warehouse' ? 'Group: Home Warehouse' : 'Group: Category');

export function exportFileName(companyName: string, title: string, ext: 'csv' | 'xlsx', at = new Date()) {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  return `${[slug(companyName), slug(title), stamp].filter(Boolean).join('_')}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A cell starting with = + - @ is run as a formula by Excel; prefix text like that
// with ' so tool names can never execute as formulas.
export const safeText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

/** One row per line, plain data (no subtotal rows) so it imports cleanly anywhere. */
export function downloadCsv(fileName: string, columns: ColumnKey[], groups: ReportGroup[], groupBy: GroupBy) {
  const defs = columnDefs(columns);
  const quote = (v: string | number | null) => {
    if (v === null) return '';
    if (typeof v === 'number') return String(v);
    const s = safeText(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [...(groupBy !== 'none' ? [groupColumnLabel(groupBy)] : []), ...defs.map((d) => d.label)];
  const lines = [header.map(quote).join(',')];
  for (const g of groups) {
    for (const r of g.rows) {
      const cells = defs.map((d) => cellValue(r, d.key));
      lines.push([...(groupBy !== 'none' ? [g.label] : []), ...cells].map(quote).join(','));
    }
  }
  // BOM so Excel reads accented characters correctly.
  downloadBlob(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), fileName);
}

export const MONEY_FORMAT = '"$"#,##0.00';

/** xlsx 0.18 cannot write frozen panes, so patch the sheet XML inside the zip. */
export function freezeTopRow(bytes: ArrayBuffer | Uint8Array, sheetNumber: number): Uint8Array<ArrayBuffer> {
  const zip = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' });
  const entry = XLSX.CFB.find(zip, `/xl/worksheets/sheet${sheetNumber}.xml`);
  if (!entry) return new Uint8Array(bytes);
  const xml = new TextDecoder().decode(entry.content);
  const patched = xml.replace(
    /<sheetView([^>]*)\/>/,
    '<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView>',
  );
  entry.content = new TextEncoder().encode(patched);
  return new Uint8Array(XLSX.CFB.write(zip, { fileType: 'zip', type: 'array', compression: true }));
}

/**
 * Sheet 1 "Inventory": header row (frozen, with filters), one row per line, grand total below.
 * Sheet 2 "Summary": report details, subtotal per group, grand total.
 */
export function downloadXlsx(fileName: string, meta: ReportMeta, columns: ColumnKey[], groups: ReportGroup[], groupBy: GroupBy) {
  const defs = columnDefs(columns);
  const grouped = groupBy !== 'none';
  const header = [...(grouped ? [groupColumnLabel(groupBy)] : []), ...defs.map((d) => d.label)];
  const aoa: (string | number | null)[][] = [header];
  for (const g of groups) {
    for (const r of g.rows) {
      aoa.push([...(grouped ? [g.label] : []), ...defs.map((d) => {
        const v = cellValue(r, d.key);
        return typeof v === 'string' ? safeText(v) : v;
      })]);
    }
  }
  const lastDataRow = aoa.length; // 1-based
  const totals = grandTotals(groups);
  const offset = grouped ? 1 : 0;
  const totalRow: (string | number | null)[] = header.map(() => null);
  totalRow[0] = 'GRAND TOTAL';
  const qtyIdx = defs.findIndex((d) => d.key === 'quantity');
  const valIdx = defs.findIndex((d) => d.key === 'totalValue');
  if (qtyIdx >= 0) totalRow[qtyIdx + offset] = totals.quantity;
  if (valIdx >= 0) totalRow[valIdx + offset] = totals.value;
  if (qtyIdx < 0 && valIdx < 0) totalRow[1] = `${totals.quantity} tools, ${formatMoney(totals.value)}`;
  aoa.push([], totalRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [...(grouped ? [{ wch: 24 }] : []), ...defs.map((d) => ({ wch: d.width }))];
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastDataRow - 1, c: header.length - 1 } }) };
  defs.forEach((d, i) => {
    if (d.key !== 'unitValue' && d.key !== 'totalValue') return;
    for (let r = 1; r < aoa.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: i + offset })];
      if (cell && cell.t === 'n') cell.z = MONEY_FORMAT;
    }
  });

  const summary: (string | number | null)[][] = [
    ['Company', meta.companyName],
    ['Report', meta.title],
    ['Filters', meta.filtersText],
    ['Printed by', meta.printedBy],
    ['Printed at', formatDateTime(meta.printedAt)],
    [],
    [grouped ? (groupBy === 'location' ? 'Location / Van' : groupBy === 'warehouse' ? 'Home Warehouse' : 'Category') : '', 'Tools', 'Total Value'],
    ...(grouped ? groups.map((g) => [g.label, g.quantity, g.value]) : []),
    ['GRAND TOTAL', totals.quantity, totals.value],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summary);
  ws2['!cols'] = [{ wch: 28 }, { wch: 60 }, { wch: 16 }];
  for (let r = 7; r < summary.length; r++) {
    const cell = ws2[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cell && cell.t === 'n') cell.z = MONEY_FORMAT;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(
    new Blob([freezeTopRow(bytes, 1)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName,
  );
}
