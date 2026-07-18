import { Check, Info } from 'lucide-react';

export type DeckingOption = {
  id: string;
  label: string;
  description: string;
  value: string;
  swatch: string;
};

export type RailingOption = {
  id: string;
  label: string;
  value: string;
  swatch: string;
  enabled: boolean;
};

export const DECKING_OPTIONS: DeckingOption[] = [
  { id: 'cedar', label: 'Cedar', description: 'Warm, natural grain', value: 'Western red cedar decking', swatch: '#B86F3F' },
  { id: 'walnut', label: 'Walnut', description: 'Rich composite', value: 'Walnut composite decking', swatch: '#594238' },
  { id: 'driftwood', label: 'Driftwood', description: 'Cool composite', value: 'Driftwood composite decking', swatch: '#85847D' },
  { id: 'treated', label: 'Treated', description: 'Classic and practical', value: 'Pressure-treated wood decking', swatch: '#A19469' },
];

export const RAILING_OPTIONS: RailingOption[] = [
  { id: 'aluminum', label: 'Black aluminum', value: 'Black aluminum picket railing', swatch: '#242925', enabled: true },
  { id: 'wood', label: 'Wood', value: 'Cedar wood guardrail', swatch: '#A9653D', enabled: true },
  { id: 'glass', label: 'Glass', value: 'Frameless glass guardrail', swatch: 'linear-gradient(135deg,#dff4f2,#8fc5c1)', enabled: true },
  { id: 'none', label: 'No railing', value: 'None', swatch: '#F4F5F3', enabled: false },
];

interface DesignControlsProps {
  deckingMaterial: string;
  railingMaterial: string;
  railingEnabled: boolean;
  guardRequired: boolean;
  onSelectDecking: (option: DeckingOption) => void;
  onSelectRailing: (option: RailingOption) => void;
}

export function DesignControls({
  deckingMaterial,
  railingMaterial,
  railingEnabled,
  guardRequired,
  onSelectDecking,
  onSelectRailing,
}: DesignControlsProps) {
  return (
    <section className="design-controls" aria-labelledby="design-controls-title" data-testid="design-controls">
      <div className="design-controls-heading">
        <div>
          <span>Live design</span>
          <h3 id="design-controls-title">Materials & railing</h3>
        </div>
        <span className="live-indicator"><i /> Preview</span>
      </div>

      <fieldset>
        <legend>Decking</legend>
        <div className="finish-grid" role="radiogroup" aria-label="Decking material">
          {DECKING_OPTIONS.map((option) => {
            const selected = deckingMaterial === option.value;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`finish-option ${selected ? 'selected' : ''}`}
                onClick={() => onSelectDecking(option)}
                title={option.description}
              >
                <span className="material-swatch" style={{ background: option.swatch }}>
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Railing system</legend>
        <div className="railing-list" role="radiogroup" aria-label="Railing system">
          {RAILING_OPTIONS.map((option) => {
            const normalizedRailing = railingMaterial.toLowerCase();
            const materialMatches = option.id === 'wood' ? normalizedRailing.includes('wood') || normalizedRailing.includes('cedar') :
              option.id === 'aluminum' ? normalizedRailing.includes('aluminum') :
              option.id === 'glass' ? normalizedRailing.includes('glass') : true;
            const selected = option.enabled === railingEnabled && materialMatches;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`railing-option ${selected ? 'selected' : ''}`}
                onClick={() => onSelectRailing(option)}
              >
                <span className="railing-swatch" style={{ background: option.swatch }} />
                <span>{option.label}</span>
                {selected && <Check size={13} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </fieldset>

      {guardRequired && !railingEnabled && (
        <div className="design-code-note" role="status">
          <Info size={14} />
          <span>This height requires a guard. Choose a railing before permit export.</span>
        </div>
      )}
    </section>
  );
}
