import { useState } from 'react';
import { CheckCircle2, MessageSquareText, TriangleAlert } from 'lucide-react';
import type { ProfessionalReviewCycle, ReviewRedlineResolution } from '../types';
import { currentResolution, unansweredRequiredRedlines } from '../services/reviewRedlines';

export function ProfessionalRedlinePanel({ cycles, currentDesignFingerprint, onResolve }: {
  cycles: ProfessionalReviewCycle[];
  currentDesignFingerprint: string;
  onResolve: (input: { cycleId: string; redlineId: string; targetDesignFingerprint: string; disposition: ReviewRedlineResolution['disposition']; response: string }) => void;
}) {
  const [selected, setSelected] = useState<{ cycleId: string; redlineId: string } | null>(null);
  const [response, setResponse] = useState('');
  const [disposition, setDisposition] = useState<ReviewRedlineResolution['disposition']>('response-only');
  const [error, setError] = useState('');
  if (!cycles.length) return null;
  const unanswered = unansweredRequiredRedlines(cycles);

  const save = () => {
    if (!selected) return;
    try {
      onResolve({ ...selected, targetDesignFingerprint: currentDesignFingerprint, disposition, response });
      setSelected(null); setResponse(''); setDisposition('response-only'); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The redline response could not be recorded.'); }
  };

  return <section className="rounded-lg border border-border bg-white p-4 space-y-4" data-testid="professional-redline-panel">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-text-primary">Professional redline response log</h3><p className="mt-1 text-xs text-text-secondary">Respond to each sheet comment, then publish the current revision back to the professional reviewer.</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${unanswered.length ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>{unanswered.length ? `${unanswered.length} unanswered` : 'Responses recorded'}</span></div>
    <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-[10px] text-text-secondary">These are owner/designer coordination responses—not professional acceptance. Only a new accepted sealed review for the current fingerprint satisfies the structural-review gate.</div>
    {[...cycles].reverse().map((cycle) => <div key={cycle.id} className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold">{cycle.issuerName} · {cycle.issuerRole}</div><div className="mt-0.5 font-mono text-[10px] text-text-secondary">{cycle.sourceDesignFingerprint} · licence {cycle.licenseNumber}</div></div><span className={`rounded px-2 py-1 text-[9px] font-semibold uppercase ${cycle.decision === 'accepted' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{cycle.decision.replace('-', ' ')}</span></div>
      {!cycle.redlines.length && <div className="flex items-center gap-2 rounded-md bg-success/5 p-2 text-xs text-success"><CheckCircle2 size={14} /> No sheet redlines recorded.</div>}
      {cycle.redlines.map((redline, index) => {
        const resolution = currentResolution(cycle, redline.id, currentDesignFingerprint);
        const isSelected = selected?.cycleId === cycle.id && selected.redlineId === redline.id;
        return <div key={redline.id} className="rounded-md bg-surface p-2.5 text-xs">
          <div className="flex items-start gap-2">{redline.severity === 'required' ? <TriangleAlert size={14} className="mt-0.5 shrink-0 text-danger" /> : <MessageSquareText size={14} className="mt-0.5 shrink-0 text-primary" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><strong>{index + 1}. {redline.title}</strong><span className="rounded bg-white px-1.5 py-0.5 text-[9px] uppercase text-text-secondary">{redline.sheetId} · {redline.category}</span></div><p className="mt-1 text-text-secondary">{redline.comment}</p></div></div>
          {resolution ? <div className="mt-2 rounded border border-success/25 bg-success/5 p-2 text-success"><div className="font-semibold">{resolution.disposition === 'addressed-in-revision' ? 'Reported addressed in this revision' : 'Response recorded for this revision'}</div><div className="mt-0.5 text-text-secondary">{resolution.response}</div></div> : !isSelected ? <button onClick={() => { setSelected({ cycleId: cycle.id, redlineId: redline.id }); setDisposition(currentDesignFingerprint === cycle.sourceDesignFingerprint ? 'response-only' : 'addressed-in-revision'); setResponse(''); setError(''); }} className="mt-2 rounded-md border border-border bg-white px-2.5 py-1.5 text-[10px] font-semibold text-primary">Record response</button> : <div className="mt-2 space-y-2 rounded-md border border-primary/25 bg-white p-2"><label className="block text-[10px] text-text-secondary">Disposition<select value={disposition} onChange={(event) => setDisposition(event.target.value as ReviewRedlineResolution['disposition'])} className="mt-1 w-full rounded border border-border bg-white px-2 py-1.5 text-xs"><option value="response-only">Response / clarification only</option><option value="addressed-in-revision" disabled={currentDesignFingerprint === cycle.sourceDesignFingerprint}>Addressed in changed revision</option></select></label><label className="block text-[10px] text-text-secondary">Owner/designer response<textarea value={response} onChange={(event) => setResponse(event.target.value)} rows={3} className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs" /></label><div className="grid grid-cols-2 gap-2"><button onClick={() => setSelected(null)} className="rounded border border-border px-2 py-1.5 text-[10px] font-semibold">Cancel</button><button onClick={save} className="rounded bg-primary px-2 py-1.5 text-[10px] font-semibold text-white">Save response</button></div>{error && <div className="text-[10px] text-danger">{error}</div>}</div>}
        </div>;
      })}
    </div>)}
  </section>;
}
