import React from 'react';
import { ReportMeta, ReportRow } from '@/lib/inventoryReport';
import { ReportHeader } from './InventoryReportDocument';

export interface VanSheet {
  id: string;
  label: string;
  techs: string[];
  rows: ReportRow[];
}

const SignatureBlock: React.FC<{ role: string }> = ({ role }) => (
  <div className="sheet-signature">
    <div className="sheet-signature-role">{role}</div>
    <div className="sheet-signature-lines">
      <div><span className="sheet-line" /><span className="sheet-line-label">Printed name</span></div>
      <div><span className="sheet-line" /><span className="sheet-line-label">Signature</span></div>
      <div className="sheet-date"><span className="sheet-line" /><span className="sheet-line-label">Date</span></div>
    </div>
  </div>
);

/** One page per van: every tool with a check box, notes, and sign-off lines. */
export const VanToolSheets: React.FC<{ meta: ReportMeta; vans: VanSheet[] }> = ({ meta, vans }) => {
  if (!vans.length) return <div className="report-doc"><p className="report-empty">No vans to print.</p></div>;
  return (
    <div className="report-doc">
      {vans.map((van) => {
        const count = van.rows.reduce((n, r) => n + r.quantity, 0);
        // A van can carry tools from several warehouses: show each tool's own.
        const showWh = van.rows.some((r) => r.warehouse);
        return (
          <section key={van.id} className="report-sheet">
            <ReportHeader
              meta={{ ...meta, filtersText: '' }}
              extra={(
                <>
                  <dt>Van</dt><dd className="sheet-van">{van.label}</dd>
                  <dt>Assigned tech</dt><dd>{van.techs.length ? van.techs.join(', ') : 'None assigned'}</dd>
                  <dt>Tools on list</dt><dd>{count}</dd>
                </>
              )}
            />
            {van.rows.length === 0 ? (
              <p className="report-empty">No tools are assigned to this van.</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th className="check-col">OK</th>
                    <th>Tool</th>
                    <th>Category</th>
                    {showWh && <th>Warehouse</th>}
                    <th>Serial #</th>
                    <th>Barcode</th>
                    <th>Condition</th>
                    <th className="num">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {van.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="check-col"><span className="check-box" /></td>
                      <td>{r.name}</td>
                      <td>{r.category}</td>
                      {showWh && <td>{r.warehouse}</td>}
                      <td>{r.serial}</td>
                      <td>{r.barcode}</td>
                      <td>{r.condition}</td>
                      <td className="num">{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="sheet-footer">
              <div className="sheet-notes">
                <div className="sheet-notes-label">Missing, damaged, or extra tools / notes:</div>
                <span className="sheet-line" />
                <span className="sheet-line" />
                <span className="sheet-line" />
              </div>
              <div className="sheet-signatures">
                <SignatureBlock role="Technician" />
                <SignatureBlock role="Manager" />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};
