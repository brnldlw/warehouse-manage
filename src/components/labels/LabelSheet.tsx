import React from 'react';
import { QrSvg } from './CodeGraphics';

export interface LabelData {
  id: string;
  code: string;
  name: string;
  /** Small extra line, e.g. serial number. */
  detail?: string;
}

/** Sizes in inches, US Letter paper. */
export interface LabelLayout {
  id: string;
  name: string;
  cols: number;
  rows: number;
  width: number;
  height: number;
  top: number;
  left: number;
  colPitch: number;
  rowPitch: number;
}

export const LABEL_LAYOUTS: LabelLayout[] = [
  { id: 'avery5160', name: 'Avery 5160 / 8160 — 30 per sheet, 1" × 2⅝"', cols: 3, rows: 10, width: 2.625, height: 1, top: 0.5, left: 0.1875, colPitch: 2.75, rowPitch: 1 },
  { id: 'avery5163', name: 'Avery 5163 / 8163 — 10 per sheet, 2" × 4"', cols: 2, rows: 5, width: 4, height: 2, top: 0.5, left: 0.15625, colPitch: 4.1875, rowPitch: 2 },
  { id: 'avery5164', name: 'Avery 5164 / 8164 — 6 per sheet, 3⅓" × 4"', cols: 2, rows: 3, width: 4, height: 3.333, top: 0.5, left: 0.15625, colPitch: 4.1875, rowPitch: 3.333 },
  { id: 'single', name: 'One label per page (plain paper)', cols: 1, rows: 1, width: 7.5, height: 10, top: 0.5, left: 0.5, colPitch: 7.5, rowPitch: 10 },
];

const inch = (n: number) => `${n}in`;

const Label: React.FC<{ label: LabelData; layout: LabelLayout }> = ({ label, layout }) => {
  if (layout.id === 'single') {
    return (
      <div className="label-single">
        <QrSvg value={label.code} size="4.5in" />
        <div className="label-code" style={{ fontSize: '40pt' }}>{label.code}</div>
        <div className="label-name" style={{ fontSize: '26pt', WebkitLineClamp: 3 }}>{label.name}</div>
        {label.detail && <div className="label-detail" style={{ fontSize: '16pt' }}>{label.detail}</div>}
      </div>
    );
  }
  // QR on the left, text on the right; font sizes scale with the label height.
  const qr = Math.min(layout.height - 0.12, layout.width * 0.45);
  const scale = Math.min(layout.height, 2);
  return (
    <div className="label-row">
      <QrSvg value={label.code} size={inch(qr)} />
      <div className="label-text">
        <div className="label-code" style={{ fontSize: `${9 + scale * 4}pt` }}>{label.code}</div>
        <div className="label-name" style={{ fontSize: `${6.5 + scale * 3}pt`, WebkitLineClamp: layout.height >= 2 ? 3 : 2 }}>{label.name}</div>
        {label.detail && layout.height >= 1 && <div className="label-detail" style={{ fontSize: `${5.5 + scale * 1.5}pt` }}>{label.detail}</div>}
      </div>
    </div>
  );
};

/**
 * Printable label sheets. `skip` leaves that many labels blank at the start, to reuse a
 * partly used sheet. Print at 100% / "Actual size" so labels line up.
 */
export const LabelSheet: React.FC<{ labels: LabelData[]; layout: LabelLayout; skip?: number }> = ({ labels, layout, skip = 0 }) => {
  const perPage = layout.cols * layout.rows;
  const slots: (LabelData | null)[] = [...Array(layout.id === 'single' ? 0 : skip).fill(null), ...labels];
  const pages: (LabelData | null)[][] = [];
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));

  return (
    <div className="label-doc">
      {pages.map((page, p) => (
        <div key={p} className="label-page">
          {page.map((label, i) => label && (
            <div
              key={label.id + i}
              className="label-cell"
              style={{
                left: inch(layout.left + (i % layout.cols) * layout.colPitch),
                top: inch(layout.top + Math.floor(i / layout.cols) * layout.rowPitch),
                width: inch(layout.width),
                height: inch(layout.height),
              }}
            >
              <Label label={label} layout={layout} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
