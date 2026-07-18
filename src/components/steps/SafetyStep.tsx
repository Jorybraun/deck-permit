import { useEffect, useMemo } from 'react';
import { useStore } from '../../state/store';
import { runComplianceCheck } from '../../services/compliance';

export function SafetyStep() {
  const property = useStore((s) => s.property);
  const deck = useStore((s) => s.deck);
  const compliance = useStore((s) => s.compliance);
  const setCompliance = useStore((s) => s.setCompliance);
  const setDeck = useStore((s) => s.setDeck);
  const resolveIssue = useStore((s) => s.resolveIssue);
  const setStep = useStore((s) => s.setStep);
  const markStepComplete = useStore((s) => s.markStepComplete);

  // Re-run compliance to make sure we have fresh results
  const rawIssues = useMemo(() => !deck || !property.parcel ? [] : compliance.length > 0 ? compliance : runComplianceCheck(deck, property), [compliance, deck, property]);
  const issues = useMemo(() => rawIssues.filter((issue, index) => rawIssues.findIndex((candidate) => candidate.id === issue.id) === index), [rawIssues]);
  useEffect(() => {
    if (deck && property.parcel && (compliance.length === 0 || issues.length !== compliance.length)) setCompliance(issues);
  }, [compliance.length, deck, issues, property.parcel, setCompliance]);

  if (!deck || !property.parcel) {
    return <div className="p-6 text-text-secondary">Design your deck first.</div>;
  }

  const unresolvedErrors = issues.filter((i) => i.severity === 'error' && !i.resolved);
  const unresolvedWarnings = issues.filter((i) => i.severity === 'warning' && !i.resolved);
  const allResolved = unresolvedErrors.length === 0 && unresolvedWarnings.length === 0;

  const handleApplyFix = (issueId: string) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue || !issue.fix) return;

    // Auto-fix common issues
    if (issue.id === 'guard-required') {
      const newDeck = { ...deck!, guard: { ...deck!.guard, enabled: true } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'guard-height') {
      const heightMm = deck!.footprint.heightAboveGrade * 1000;
      const requiredHeight = heightMm > 1800 ? 1070 : 900;
      const newDeck = { ...deck!, guard: { ...deck!.guard, enabled: true, height: requiredHeight } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'guard-opening') {
      const newDeck = { ...deck!, guard: { ...deck!.guard, openingMax: 100 } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'stair-rise') {
      const newRise = deck!.stairs.riserHeight < 125 ? 125 : 200;
      const newDeck = { ...deck!, stairs: { ...deck!.stairs, riserHeight: newRise } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'stair-run') {
      const newRun = deck!.stairs.treadRun < 255 ? 255 : 355;
      const newDeck = { ...deck!, stairs: { ...deck!.stairs, treadRun: newRun } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'stair-width') {
      const newDeck = { ...deck!, stairs: { ...deck!.stairs, width: 0.9 } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'post-size') {
      const newDeck = { ...deck!, structure: { ...deck!.structure, postSize: '6x6' } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'decking-thickness') {
      const newDeck = { ...deck!, structure: { ...deck!.structure, deckingThickness: 38 } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'footing-size') {
      const newDeck = { ...deck!, structure: { ...deck!.structure, footingSize: 300 } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'footing-depth') {
      const newDeck = { ...deck!, structure: { ...deck!.structure, footingDepth: 450 } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else if (issue.id === 'ledger-missing') {
      const newDeck = { ...deck!, structure: { ...deck!.structure, ledgerAttachment: 'Connection design required after field verification' } };
      setDeck(newDeck);
      setCompliance(runComplianceCheck(newDeck, property));
    } else {
      // Just mark as resolved for issues we can't auto-fix
      resolveIssue(issueId);
    }
  };

  const handleContinue = () => {
    markStepComplete('safety');
    setStep('planset');
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-1">Code Check</h2>
        <p className="text-sm text-text-secondary">
          Preliminary screening against the BC Building Code 2024 and Sidney Zoning Bylaw 2275. Survey and professional review gates remain separate.
        </p>
      </div>

      {/* Status banner */}
      <div className={`rounded-lg p-4 ${allResolved ? 'bg-success/10' : 'bg-danger/10'}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${allResolved ? 'bg-success' : 'bg-danger'}`} />
          <span className={`text-sm font-medium ${allResolved ? 'text-success' : 'text-danger'}`}>
            {allResolved
              ? 'Screening clear — ready to generate a professional review package'
              : `${unresolvedErrors.length} error${unresolvedErrors.length > 1 ? 's' : ''}, ${unresolvedWarnings.length} warning${unresolvedWarnings.length > 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Issues list */}
      <div className="space-y-3">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className={`rounded-lg p-4 border ${
              issue.resolved
                ? 'border-success bg-success/5'
                : issue.severity === 'error'
                ? 'border-danger bg-danger/5'
                : 'border-warning bg-warning/5'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium uppercase ${
                    issue.resolved ? 'text-success' : issue.severity === 'error' ? 'text-danger' : 'text-warning'
                  }`}>
                    {issue.resolved ? 'Resolved' : issue.severity}
                  </span>
                  <span className="text-xs text-text-secondary">{issue.codeRef}</span>
                </div>
                <p className="text-sm text-text-primary">{issue.message}</p>
              {issue.fix && !issue.resolved && (
                  <p className="text-xs text-text-secondary mt-2">{issue.fix}</p>
                )}
              </div>
              {issue.fix && !issue.resolved && isAutoFixable(issue.id) && (
                <button
                  onClick={() => handleApplyFix(issue.id)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover"
                >
                  Fix
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setStep('structure')}
          className="px-4 py-2.5 rounded-lg border border-border text-text-primary hover:bg-surface font-medium text-sm"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={unresolvedErrors.length > 0}
          className="flex-1 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {unresolvedErrors.length > 0 ? 'Fix all errors to continue' : 'Generate plan set'}
        </button>
      </div>
    </div>
  );
}

function isAutoFixable(issueId: string): boolean {
  return new Set([
    'guard-required', 'guard-height', 'guard-opening',
    'stair-rise', 'stair-run', 'stair-width',
    'post-size', 'decking-thickness',
  ]).has(issueId);
}
