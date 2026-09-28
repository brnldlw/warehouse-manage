import React from 'react';
import {
  ColumnKey, ReportGroup, ReportMeta, cellText, columnDefs, formatDateTime, formatMoney, grandTotals,
} from '@/lib/inventoryReport';

interface Props {
  meta: ReportMeta;
  columns: ColumnKey[];
  groups: ReportGroup[];
}

/** Report header block shared by all printed documents. */
export const ReportHeader: React.FC<{ meta: ReportMeta; extra?: React.ReactNode }> = ({ meta, extra }) => (
  <header className="report-header">
    <div className="report-company">{meta.companyName || 'Company'}</div>
    <h1 className="report-title">{meta.title}</h1>
    <dl className="report-facts">
      {extra}
      {meta.filtersText && (<><dt>Filters</dt><dd>{meta.filtersText}</dd></>)}
      <dt>Printed by</dt><dd>{meta.printedBy}</dd>
      <dt>Printed</dt><dd>{formatDateTime(meta.printedAt)}</dd>
    </dl>
  </header>
);

/** A subtotal/total line: label on the left, qty and value under their own columns. */
const TotalRow: React.FC<{ columns: ColumnKey[]; label: string; quantity: number; value: number; className: string }> = ({
  columns, label, quantity, value, className,
}) => {
  const firstNumeric = columns.findIndex((k) => k === 'quantity' || k === 'totalValue');
  const summaryText = `${label}: ${quantity} tool${quantity === 1 ? '' : 's'}${firstNumeric < 0 ? `, ${formatMoney(value)}` : ''}`;
  if (firstNumeric <= 0) {
    return (
      <tr className={className}>
        <td colSpan={columns.length}>{summaryText}</td>
      </tr>
    );
  }
  return (
    <tr className={className}>
      <td colSpan={firstNumeric}>{summaryText}</td>
      {columns.slice(firstNumeric).map((k) => (
        <td key={k} className="num">
          {k === 'quantity' ? quantity : k === 'totalValue' ? formatMoney(value) : ''}
        </td>
      ))}
    </tr>
  );
};

export const InventoryReportDocument: React.FC<Props> = ({ meta, columns, groups }) => {
  const defs = columnDefs(columns);
  const keys = defs.map((d) => d.key);
  const totals = grandTotals(groups);
  const isEmpty = totals.quantity === 0;

  return (
    <div className="report-doc">
      <ReportHeader meta={meta} />
      {isEmpty ? (
        <p className="report-empty">No tools match these filters.</p>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              {defs.map((d) => (
                <th key={d.key} className={d.numeric ? 'num' : undefined}>{d.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g.key}>
                {g.label !== null && (
                  <tr className="report-group-row">
                    <td colSpan={keys.length}>{g.label}</td>
                  </tr>
                )}
                {g.rows.map((r) => (
                  <tr key={r.key}>
                    {defs.map((d) => (
                      <td key={d.key} className={d.numeric ? 'num' : undefined}>{cellText(r, d.key)}</td>
                    ))}
                  </tr>
                ))}
                {g.label !== null && (
                  <TotalRow columns={keys} label={`Subtotal — ${g.label}`} quantity={g.quantity} value={g.value} className="report-subtotal-row" />
                )}
              </React.Fragment>
            ))}
            <TotalRow columns={keys} label="Grand total" quantity={totals.quantity} value={totals.value} className="report-total-row" />
          </tbody>
        </table>
      )}
    </div>
  );
};
