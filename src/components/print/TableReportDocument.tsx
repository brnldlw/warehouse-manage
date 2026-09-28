import React from 'react';
import { ReportMeta } from '@/lib/inventoryReport';
import { Cell, TableColumn } from '@/lib/tableExport';
import { ReportHeader } from './InventoryReportDocument';

export interface PrintSection {
  title: string;
  note?: string;
  columns: (TableColumn & { numeric?: boolean })[];
  rows: Record<string, Cell>[];
  empty?: string;
}

/** Printed report made of titled tables (same look as the inventory report). */
export const TableReportDocument: React.FC<{ meta: ReportMeta; notes?: string[]; sections: PrintSection[] }> = ({ meta, notes = [], sections }) => (
  <div className="report-doc">
    <ReportHeader meta={meta} />
    {notes.map((n) => <p key={n} style={{ margin: '0 0 6pt', fontSize: '10pt' }}><strong>Note:</strong> {n}</p>)}
    {sections.map((s) => (
      <section key={s.title} style={{ marginTop: '12pt' }}>
        <h2 style={{ fontSize: '13pt', fontWeight: 700, margin: '0 0 4pt', breakAfter: 'avoid' }}>{s.title}</h2>
        {s.note && <p style={{ margin: '0 0 4pt', fontSize: '9.5pt' }}>{s.note}</p>}
        {s.rows.length === 0 ? (
          <p className="report-empty">{s.empty ?? 'Nothing to show.'}</p>
        ) : (
          <table className="report-table">
            <thead><tr>{s.columns.map((c) => <th key={c.key} className={c.numeric ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i}>{s.columns.map((c) => <td key={c.key} className={c.numeric ? 'num' : undefined}>{r[c.key] ?? ''}</td>)}</tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    ))}
  </div>
);
