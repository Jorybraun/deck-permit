import { FileText, ListChecks, Ruler, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import type { Property } from '../../types';
import type { SiteComplianceAssessment } from '../../domain/siteModel';
import { evaluateSidneyRequirements, type RequirementStatus } from '../../jurisdiction/evaluateRequirements';

const STATUS_STYLE: Record<RequirementStatus, string> = {
  required: 'bg-emerald-100 text-emerald-900',
  conditional: 'bg-sky-100 text-sky-900',
  confirm: 'bg-violet-100 text-violet-900',
};
const STATUS_LABEL: Record<RequirementStatus, string> = { required: 'Required', conditional: 'If triggered', confirm: 'Confirm' };
const fmtM = (mm: number) => `${(mm / 1000).toFixed(2)} m`;

/**
 * Surfaces the Town of Sidney submission requirements against the current project: the
 * required drawings, the required-vs-proposed setbacks (variance-flagged), lot coverage,
 * and the full supporting-document checklist with what triggers each.
 */
export function SidneySubmissionPanel({ property, compliance }: { property: Property; compliance: SiteComplianceAssessment }) {
  const req = useMemo(() => evaluateSidneyRequirements(property, compliance), [property, compliance]);
  const categories = [...new Set(req.supportingDocs.map((doc) => doc.category))];

  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><span className="text-[10px] font-bold uppercase tracking-[.12em] text-emerald-800">{req.municipality} · submission requirements</span><h3 className="mt-1 font-[Manrope] text-lg font-bold text-slate-950">What this deck permit needs</h3></div>
      <div className="flex flex-wrap gap-2 text-[10px] font-bold">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{req.summary.requiredDrawings} required drawings</span>
        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800">{req.summary.conditionalDocs} conditional docs</span>
        {req.summary.variances > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-800">{req.summary.variances} variance{req.summary.variances === 1 ? '' : 's'}</span>}
      </div>
    </div>

    {/* Drawings */}
    <div className="mt-5">
      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-slate-500"><FileText size={14} /> Required drawings</h4>
      <ul className="mt-3 grid gap-2">{req.drawings.map((drawing) => <li key={drawing.id} className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-900">{drawing.label.split('(')[0].trim()}</strong><span className="flex items-center gap-2">{drawing.minScale && <span className="font-mono text-[10px] font-bold text-sky-700">{drawing.minScale}</span>}<span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_STYLE[drawing.status]}`}>{STATUS_LABEL[drawing.status]}</span></span></div>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{drawing.label.includes('(') ? drawing.label.slice(drawing.label.indexOf('(') + 1, drawing.label.lastIndexOf(')')) : drawing.note}</p>
      </li>)}</ul>
    </div>

    {/* Project data / setbacks */}
    <div className="mt-5">
      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-slate-500"><Ruler size={14} /> Project data · setbacks {req.projectData.zone ? `(zone ${req.projectData.zone})` : ''}</h4>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50 text-[10px] uppercase tracking-[.08em] text-slate-500"><th className="px-3 py-2 text-left">Yard</th><th className="px-3 py-2 text-left">Required</th><th className="px-3 py-2 text-left">Proposed</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
          <tbody>{req.projectData.setbacks.map((row) => <tr key={row.yard} className="border-t border-slate-100">
            <td className="px-3 py-2 font-semibold capitalize text-slate-800">{row.yard.replace('-', ' ')}</td>
            <td className="px-3 py-2 tabular-nums text-slate-700">{fmtM(row.requiredMm)}</td>
            <td className="px-3 py-2 tabular-nums text-slate-700">{row.proposedMm !== null ? fmtM(row.proposedMm) : '—'}</td>
            <td className="px-3 py-2">{row.proposedMm === null ? <span className="text-slate-400">draw the deck</span> : row.variance ? <span className="font-bold text-red-700">Variance ✱</span> : <span className="font-semibold text-emerald-700">OK</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {req.projectData.coverage.proposedPct !== null && <p className={`mt-2 text-xs ${req.projectData.coverage.exceeds ? 'text-red-700' : 'text-slate-600'}`}>Lot coverage: {req.projectData.coverage.proposedPct.toFixed(1)}% of {req.projectData.coverage.maxPct?.toFixed(0) ?? '—'}% max{req.projectData.coverage.exceeds ? ' — exceeds limit' : ''}.</p>}
      {req.summary.variances > 0 && <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-red-700"><AlertTriangle size={13} className="mt-0.5 shrink-0" />A proposed setback is tighter than the zone requires — this needs a variance request (or move the deck). Low uncovered decks may qualify under the §5.1.6.b projection allowance.</p>}
    </div>

    {/* Supporting documents */}
    <div className="mt-5">
      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-slate-500"><ListChecks size={14} /> Supporting documents</h4>
      <p className="mt-1 text-[11px] text-slate-500">Beyond the drawings. Conditional items apply only when their trigger fires — we auto-light those from your site data next.</p>
      {categories.map((category) => <div key={category} className="mt-3">
        <span className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-400">{category}</span>
        <ul className="mt-1.5 grid gap-1.5">{req.supportingDocs.filter((doc) => doc.category === category).map((doc) => <li key={doc.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-2.5">
          <span className="text-xs leading-5 text-slate-700">{doc.label}{doc.when && <span className="mt-0.5 block text-[10px] text-slate-400">Only {doc.when}</span>}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_STYLE[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>
        </li>)}</ul>
      </div>)}
    </div>

    <p className="mt-5 rounded-lg bg-slate-50 p-3 text-[10px] leading-4 text-slate-500">Reference from the Town of Sidney building-permit application + Zoning Bylaw 2275. The Town reviews only a complete package; two stamped paper sets are required before issuance. Confirm with Development Services before final submission.</p>
  </article>;
}
