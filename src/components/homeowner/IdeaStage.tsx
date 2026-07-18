import { ArrowRight, Check, Compass, Sparkles } from 'lucide-react';
import type { HomeownerIntent } from '../../state/homeownerProjectStore';

interface IdeaStageProps {
  intent: HomeownerIntent;
  onChange: (changes: Partial<HomeownerIntent>) => void;
  onContinue: () => void;
}

const USES = ['Dining', 'Lounging', 'Entertaining', 'Hot tub', 'Cooking', 'Accessible entry'];
const FEATURES = ['Multiple levels', 'Stairs to yard', 'Privacy screen', 'Pergola', 'Built-in seating', 'Lighting'];

/** Captures the homeowner's spatial brief before technical design begins. */
export function IdeaStage({ intent, onChange, onContinue }: IdeaStageProps) {
  return <StageFrame eyebrow="Your project" title="What should this deck make possible?" description="Start with how you want to use the space. The design agent will turn this brief into requirements without locking you into a template.">
    <ChoiceGroup label="How will you use it?" values={USES} selected={intent.uses} onChange={(uses) => onChange({ uses })} />
    <ChoiceGroup label="Features you may want" values={FEATURES} selected={intent.desiredFeatures} onChange={(desiredFeatures) => onChange({ desiredFeatures })} />

    <div className="grid gap-5 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold text-slate-800">
        Material direction
        <select value={intent.materialPreference} onChange={(event) => onChange({ materialPreference: event.target.value as HomeownerIntent['materialPreference'] })} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-800">
          <option value="unsure">Help me choose</option>
          <option value="treated-wood">Pressure-treated wood</option>
          <option value="cedar">Cedar</option>
          <option value="composite">Composite</option>
          <option value="waterproof">Waterproof deck surface</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-800">
        Working budget
        <select value={intent.budgetRange} onChange={(event) => onChange({ budgetRange: event.target.value as HomeownerIntent['budgetRange'] })} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-800">
          <option value="unsure">Not sure yet</option>
          <option value="under-15k">Under $15,000</option>
          <option value="15k-30k">$15,000–$30,000</option>
          <option value="30k-60k">$30,000–$60,000</option>
          <option value="60k-plus">$60,000+</option>
        </select>
      </label>
    </div>

    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      Anything else the design should solve?
      <textarea value={intent.inspirationNotes} onChange={(event) => onChange({ inspirationNotes: event.target.value })} rows={4} placeholder="For example: keep the view open, avoid the basement window, connect the kitchen door to the garden..." className="resize-y rounded-lg border border-slate-300 px-3 py-3 font-normal text-slate-800 placeholder:text-slate-400" />
    </label>

    <div className="flex flex-col gap-3 rounded-xl border border-emerald-900/10 bg-emerald-50 p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-emerald-800"><Sparkles size={18} /></span>
      <p className="flex-1 text-sm leading-6 text-emerald-950">Your brief remains editable. It guides materials, layout checks, permit notes, and the builder brief later.</p>
      <button type="button" onClick={onContinue} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-5 text-sm font-bold text-white hover:bg-emerald-900">Research my property <ArrowRight size={16} /></button>
    </div>
  </StageFrame>;
}

function ChoiceGroup({ label, values, selected, onChange }: { label: string; values: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  return <fieldset>
    <legend className="mb-3 text-sm font-semibold text-slate-800">{label}</legend>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {values.map((value) => {
        const checked = selected.includes(value);
        return <button key={value} type="button" aria-pressed={checked} onClick={() => onChange(checked ? selected.filter((item) => item !== value) : [...selected, value])} className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium ${checked ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}>
          <span className={`grid h-5 w-5 place-items-center rounded border ${checked ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300'}`}>{checked && <Check size={13} strokeWidth={3} />}</span>{value}
        </button>;
      })}
    </div>
  </fieldset>;
}

function StageFrame({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <main className="h-full overflow-y-auto bg-[#f7f8f6] px-5 py-8 sm:px-8 lg:px-12">
    <div className="mx-auto grid max-w-3xl gap-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
      <header>
        <span className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-emerald-800"><Compass size={15} />{eyebrow}</span>
        <h2 className="font-[Manrope] text-3xl font-bold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{description}</p>
      </header>
      {children}
    </div>
  </main>;
}
