import { useStore } from '../state/store';
import type { StepId } from '../types';

export function StepRail() {
  const steps = useStore((s) => s.steps);
  const currentStep = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);

  return (
    <div className="border-b border-border px-6 py-4 shrink-0">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {steps.map((step, i) => {
          const isActive = step.id === currentStep;
          const isComplete = step.status === 'complete';
          const isClickable = isComplete || isActive;

          return (
            <div key={step.id} className="flex items-center shrink-0">
              <button
                onClick={() => isClickable && setStep(step.id as StepId)}
                disabled={!isClickable}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : isComplete
                    ? 'text-primary hover:bg-surface'
                    : 'text-text-secondary cursor-not-allowed'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                  isActive ? 'bg-white/20' : isComplete ? 'bg-primary/10' : 'bg-surface'
                }`}>
                  {isComplete ? '✓' : i + 1}
                </span>
                <span className="whitespace-nowrap">{step.title}</span>
              </button>
              {i < steps.length - 1 && (
                <div className={`w-4 h-px ${isComplete ? 'bg-primary' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
