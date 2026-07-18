import { create } from 'zustand';
import type { AppState, StepId, Property, Deck, ComplianceIssue, PlanSheet, Step, StructuralReport, SubmissionReadiness, PermitManifest, VerificationEvidence, ReviewExchangePublication, SidneyApplicationData, ExistingHouseConditions, ProfessionalReviewCycle, ReviewRedlineResolution, DrawingIssueRecord, PermitSubmissionRecord } from '../types';
import { assessVerificationEvidence } from '../services/verificationEvidence';
import { evaluateSubmissionReadiness } from '../services/submissionReadiness';
import { recordRedlineResolution, upsertProfessionalReviewCycle } from '../services/reviewRedlines';
import { issuePermitPackage, type PermitPackage } from '../services/planSetGenerator';

const initialSteps: Step[] = [
  { id: 'land', title: 'Start', subtitle: 'Enter your address', status: 'active' },
  { id: 'lot', title: 'Your Lot', subtitle: 'Review property data', status: 'pending' },
  { id: 'vision', title: 'Deck Style', subtitle: 'Pick a starting point', status: 'pending' },
  { id: 'shape', title: 'Shape & Size', subtitle: 'Refine the footprint', status: 'pending' },
  { id: 'structure', title: 'Structure', subtitle: 'Review framing', status: 'pending' },
  { id: 'safety', title: 'Code Check', subtitle: 'Fix any issues', status: 'pending' },
  { id: 'planset', title: 'Plan Set', subtitle: 'Review drawings', status: 'pending' },
  { id: 'submit', title: 'Submit', subtitle: 'Apply for permit', status: 'pending' },
];

const emptyProperty: Property = {
  address: null,
  parcel: null,
  zoning: null,
  buildableEnvelope: null,
  snowLoad: 1.0, // Victoria area default
  buildings: [],
  evidence: [],
  existingConditions: null,
};

interface Store extends AppState {
  persistenceStatus: 'loading' | 'saving' | 'saved' | 'error';
  lastSavedAt: string | null;
  setStep: (step: StepId) => void;
  setProperty: (property: Partial<Property>) => void;
  setExistingConditions: (conditions: ExistingHouseConditions | null) => void;
  setDeck: (deck: Deck | null) => void;
  updateDeck: (updates: Partial<Deck>) => void;
  setCompliance: (issues: ComplianceIssue[]) => void;
  resolveIssue: (id: string) => void;
  setPlanset: (sheets: PlanSheet[] | null) => void;
  setStructuralReport: (report: StructuralReport | null) => void;
  setSubmissionReadiness: (readiness: SubmissionReadiness | null) => void;
  setPermitManifest: (manifest: PermitManifest | null) => void;
  addVerificationEvidence: (evidence: VerificationEvidence) => void;
  removeVerificationEvidence: (id: string) => void;
  setReviewExchange: (reviewExchange: ReviewExchangePublication | null) => void;
  upsertProfessionalReviewCycle: (cycle: ProfessionalReviewCycle) => void;
  resolveReviewRedline: (input: { cycleId: string; redlineId: string; targetDesignFingerprint: string; disposition: ReviewRedlineResolution['disposition']; response: string }) => void;
  setDrawingIssueHistory: (history: DrawingIssueRecord[]) => void;
  issueDrawingPackage: () => PermitPackage | null;
  recordPermitSubmission: (record: PermitSubmissionRecord) => void;
  setSidneyApplication: (sidneyApplication: SidneyApplicationData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  markStepComplete: (step: StepId) => void;
  reset: () => void;
}

export const useStore = create<Store>((set) => ({
  step: 'land',
  steps: initialSteps,
  property: emptyProperty,
  deck: null,
  compliance: [],
  planset: null,
  structuralReport: null,
  submissionReadiness: null,
  permitManifest: null,
  verificationEvidence: [],
  reviewExchange: null,
  professionalReviewCycles: [],
  drawingIssueHistory: [],
  permitSubmissionHistory: [],
  sidneyApplication: null,
  loading: false,
  error: null,
  persistenceStatus: 'loading',
  lastSavedAt: null,

  setStep: (step) =>
    set((state) => ({
      step,
      steps: state.steps.map((s) => ({
        ...s,
        status: s.id === step ? 'active' : s.status === 'active' ? 'complete' : s.status,
      })),
    })),

  setProperty: (property) =>
    set((state) => ({
      property: { ...state.property, ...property, existingConditions: property.existingConditions ?? null },
      planset: null,
      structuralReport: null,
      submissionReadiness: null,
      permitManifest: null,
      verificationEvidence: [],
      reviewExchange: null,
      professionalReviewCycles: [],
      drawingIssueHistory: [],
      permitSubmissionHistory: [],
      sidneyApplication: null,
    })),

  setExistingConditions: (existingConditions) =>
    set((state) => ({
      property: { ...state.property, existingConditions },
      planset: null,
      structuralReport: null,
      submissionReadiness: null,
      permitManifest: null,
      reviewExchange: null,
      sidneyApplication: null,
    })),

  setDeck: (deck) => set({ deck, planset: null, structuralReport: null, submissionReadiness: null, permitManifest: null, reviewExchange: null, sidneyApplication: null }),

  updateDeck: (updates) =>
    set((state) => ({
      deck: state.deck ? { ...state.deck, ...updates } : null,
      planset: null,
      structuralReport: null,
      submissionReadiness: null,
      permitManifest: null,
      reviewExchange: null,
      sidneyApplication: null,
    })),

  setCompliance: (compliance) => set({ compliance }),

  resolveIssue: (id) =>
    set((state) => ({
      compliance: state.compliance.map((i) =>
        i.id === id ? { ...i, resolved: true } : i
      ),
    })),

  setPlanset: (planset) => set({ planset }),

  setStructuralReport: (structuralReport) => set({ structuralReport }),

  setSubmissionReadiness: (submissionReadiness) => set({ submissionReadiness }),

  setPermitManifest: (permitManifest) =>
    set((state) => {
      if (!permitManifest || !state.structuralReport) return { permitManifest };
      const assessment = assessVerificationEvidence(state.structuralReport.gates, state.verificationEvidence, permitManifest.designFingerprint);
      return {
        permitManifest,
        submissionReadiness: evaluateSubmissionReadiness(state.structuralReport, assessment.confirmedGateIds),
      };
    }),

  addVerificationEvidence: (evidence) =>
    set((state) => {
      const verificationEvidence = [...state.verificationEvidence.filter((item) => item.id !== evidence.id), evidence];
      if (!state.structuralReport || !state.permitManifest) return { verificationEvidence };
      const assessment = assessVerificationEvidence(state.structuralReport.gates, verificationEvidence, state.permitManifest.designFingerprint);
      return {
        verificationEvidence,
        submissionReadiness: evaluateSubmissionReadiness(state.structuralReport, assessment.confirmedGateIds),
      };
    }),

  removeVerificationEvidence: (id) =>
    set((state) => {
      const verificationEvidence = state.verificationEvidence.filter((item) => item.id !== id);
      if (!state.structuralReport || !state.permitManifest) return { verificationEvidence };
      const assessment = assessVerificationEvidence(state.structuralReport.gates, verificationEvidence, state.permitManifest.designFingerprint);
      return {
        verificationEvidence,
        submissionReadiness: evaluateSubmissionReadiness(state.structuralReport, assessment.confirmedGateIds),
      };
    }),

  setReviewExchange: (reviewExchange) => set({ reviewExchange }),

  upsertProfessionalReviewCycle: (cycle) => set((state) => ({ professionalReviewCycles: upsertProfessionalReviewCycle(state.professionalReviewCycles, cycle) })),

  resolveReviewRedline: (input) => set((state) => ({ professionalReviewCycles: recordRedlineResolution(state.professionalReviewCycles, input) })),

  setDrawingIssueHistory: (drawingIssueHistory) => set({ drawingIssueHistory }),

  issueDrawingPackage: () => {
    let result: PermitPackage | null = null;
    set((state) => {
      if (!state.deck || !state.property.parcel) return state;
      const issued = issuePermitPackage(state.property, state.deck, state.drawingIssueHistory);
      result = issued.permitPackage;
      return {
        planset: issued.permitPackage.sheets,
        structuralReport: issued.permitPackage.report,
        submissionReadiness: issued.permitPackage.readiness,
        permitManifest: issued.permitPackage.manifest,
        drawingIssueHistory: issued.issueHistory,
      };
    });
    return result;
  },

  recordPermitSubmission: (record) => set((state) => ({
    permitSubmissionHistory: state.permitSubmissionHistory.some((item) => item.id === record.id)
      ? state.permitSubmissionHistory
      : [...state.permitSubmissionHistory, record],
  })),

  setSidneyApplication: (sidneyApplication) => set({ sidneyApplication }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  markStepComplete: (stepId) =>
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === stepId ? { ...s, status: 'complete' } : s
      ),
    })),

  reset: () =>
    set({
      step: 'land',
      steps: initialSteps,
      property: emptyProperty,
      deck: null,
      compliance: [],
      planset: null,
      structuralReport: null,
      submissionReadiness: null,
      permitManifest: null,
      verificationEvidence: [],
      reviewExchange: null,
      professionalReviewCycles: [],
      drawingIssueHistory: [],
      permitSubmissionHistory: [],
      sidneyApplication: null,
      loading: false,
      error: null,
    }),
}));
