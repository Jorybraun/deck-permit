/**
 * Jurisdiction Rule Pack — the data-driven definition of what a single municipality
 * requires. The app renders its inputs, checklist, and submission gates FROM a rule
 * pack evaluated against the project, instead of hardcoding one town's maximal form.
 *
 * Adding a town = authoring a rule pack, not changing the engine. This is the backbone
 * of both the adaptive form (hide what does not apply) and provable checklist coverage.
 */

/** How a checklist item is triggered. `always` items are unconditional; the rest are
 *  auto-evaluated from GIS/design/project data where possible, or asked as a yes/no. */
export type ChecklistTrigger =
  | { kind: 'always' }
  | { kind: 'applicantNotOwner' }
  | { kind: 'ownerIsCompany' }
  | { kind: 'newConstruction' }
  | { kind: 'gisElevationBelowGeodetic'; metres: number } // FCL flood report
  | { kind: 'nearProtectedTree' } // footings/works within a protected tree root zone
  | { kind: 'removesOrPrunesProtectedTree' }
  | { kind: 'esaOverlay' } // Environmentally Sensitive Area, or changes use/servicing/access
  | { kind: 'buildingBuiltBeforeYear'; year: number } // hazmat / abatement
  | { kind: 'occupiesRightOfWay' } // deck/works over sidewalk, lane, boulevard, on-street parking
  | { kind: 'increasesImpermeableArea' } // stormwater management plan
  | { kind: 'contaminatedSiteHistory' } // Site Disclosure Statement
  | { kind: 'archaeologicalSite' }
  | { kind: 'temporaryConstructionWater' } // CRD cross-connection control
  | { kind: 'requiredByInspector' } // e.g. Construction Management Plan, Letters of Assurance
  | { kind: 'userConfirmed'; question: string }; // fallback when it cannot be auto-derived

export interface ChecklistItem {
  id: string;
  label: string;
  category: 'admin' | 'drawing' | 'engineering' | 'environmental' | 'utility' | 'safety';
  trigger: ChecklistTrigger;
  /** Whether this item can ever apply to a residential DECK project (most heavy items cannot). */
  appliesToDeck: boolean;
  note?: string;
}

export interface ApplicationField {
  id: string;
  label: string;
  /** Show this input only when the trigger evaluates true; `always` inputs are core. */
  trigger: ChecklistTrigger;
  appliesToDeck: boolean;
}

export interface RulePack {
  id: string;
  municipality: string;
  province: string;
  effectiveDate: string;
  source: string;
  contacts: { department: string; phone: string; email: string; address: string };
  /** Digital drawing set required for submission (paper stamped sets required at issuance). */
  drawings: Array<{ id: string; label: string; minScale?: string; trigger: ChecklistTrigger; appliesToDeck: boolean; note?: string }>;
  applicationFields: ApplicationField[];
  checklist: ChecklistItem[];
  issuance: {
    paperApprovedSets: number;
    /** Covenants that must be registered on title before the permit is issued. */
    covenantsOnTitle: string[];
    /** Fees and deposits payable before issuance (amounts confirmed by Town at review). */
    feesBeforeIssuance: string[];
    notes: string[];
  };
}
