// CSV / Excel export for any simple table (used by the Tool Usage report). Same style as the
// inventory exports: formula-safe text, UTF-8 CSV for Excel, frozen header row and filters.

import * as XLSX from 'xlsx';
import { MONEY_FORMAT, downloadBlob, freezeTopRow, safeText } from '@/lib/inventoryReport';

export type Cell = string | number | null;

export interface TableColumn {
  key: string;
  label: string;
  /** Excel width in characters. */
  width?: number;
  money?: boolean;
}

export interface TableSheet {
  name: string;
  columns: TableColumn[];
  rows: Record<string, Cell>[];
}

const clean = (v: Cell) => (typeof v === 'string' ? safeText(v) : v);

export function downloadTableCsv(fileName: string, columns: TableColumn[], rows: Record<string, Cell>[]) {
  const quote = (v: Cell) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    const s = safeText(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => quote(c.label)).join(','), ...rows.map((r) => columns.map((c) => quote(r[c.key])).join(','))];
  downloadBlob(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), fileName);
}

/**
 * One Excel file with several sheets. Data sheets get a frozen header row and filters;
 * `infoRows` go on a first "About" sheet (report title, period, notes).
 */
export function downloadTableXlsx(fileName: string, sheets: TableSheet[], infoRows: [string, string][] = []) {
  const wb = XLSX.utils.book_new();
  const dataSheetNumbers: number[] = [];
  if (infoRows.length) {
    const about = XLSX.utils.aoa_to_sheet(infoRows);
    about['!cols'] = [{ wch: 18 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, about, 'About');
  }
  for (const s of sheets) {
    const aoa: Cell[][] = [s.columns.map((c) => c.label), ...s.rows.map((r) => s.columns.map((c) => clean(r[c.key] ?? null)))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = s.columns.map((c) => ({ wch: c.width ?? 14 }));
    if (s.rows.length) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: s.rows.length, c: s.columns.length - 1 } }) };
    }
    s.columns.forEach((c, ci) => {
      if (!c.money) return;
      for (let r = 1; r <= s.rows.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
        if (cell && cell.t === 'n') cell.z = MONEY_FORMAT;
      }
    });
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    dataSheetNumbers.push(wb.SheetNames.length);
  }
  let bytes: ArrayBuffer | Uint8Array = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  for (const n of dataSheetNumbers) bytes = freezeTopRow(bytes, n);
  downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}
