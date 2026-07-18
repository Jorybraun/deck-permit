import type { PlanSheet, Property } from '../types';
import { escapeXml } from './planSetGenerator';

export function buildPrintablePackage(property: Property, sheets: PlanSheet[]): string {
  const address = property.address?.fullAddress || 'Deck design review package';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeXml(address)} — deck review package</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;background:#dfe4e1;font-family:Arial,sans-serif}
    .toolbar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:14px;padding:12px 18px;background:#17241d;color:white}
    .toolbar button{border:0;border-radius:6px;padding:9px 14px;background:#fff;color:#17241d;font-weight:700;cursor:pointer}
    .toolbar span{font-size:13px;opacity:.8}
    .sheet{width:17in;height:11in;margin:20px auto;background:#fff;box-shadow:0 4px 18px #0002;overflow:hidden;break-after:page;page-break-after:always}
    .sheet svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%}
    @page{size:ledger landscape;margin:0}
    @media print{html,body{width:17in;background:#fff}.toolbar{display:none}.sheet{width:17in;height:11in;margin:0;box-shadow:none;break-inside:avoid;page-break-inside:avoid}}
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><span>Choose 11×17 landscape, actual size (100%), and no browser headers or footers.</span></div>
  ${sheets.map((sheet) => `<section class="sheet" aria-label="${escapeXml(sheet.title)}">${sheet.svg}</section>`).join('')}
</body>
</html>`;
}

export function openPrintablePackage(property: Property, sheets: PlanSheet[]): boolean {
  const printFrame = document.createElement('iframe');
  printFrame.setAttribute('title', 'Printable deck drawing package');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '1px';
  printFrame.style.height = '1px';
  printFrame.style.border = '0';
  printFrame.style.opacity = '0';
  printFrame.srcdoc = buildPrintablePackage(property, sheets);
  printFrame.onload = () => {
    const printableWindow = printFrame.contentWindow;
    if (!printableWindow) return;
    printableWindow.focus();
    printableWindow.print();
  };
  document.body.appendChild(printFrame);
  window.setTimeout(() => printFrame.remove(), 60_000);
  return true;
}

export function downloadPrintablePackage(property: Property, sheets: PlanSheet[]): void {
  const html = buildPrintablePackage(property, sheets);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const civic = property.address?.civicNumber || 'project';
  const street = property.address?.streetName?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'deck';
  anchor.download = `deck-review-package-${civic}-${street}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}
