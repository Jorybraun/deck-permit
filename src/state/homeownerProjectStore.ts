import { create } from 'zustand';
import type { PermitSubmissionRecord, ProfessionalReviewCycle, Property, ReviewExchangePublication, ReviewRedlineResolution, SidneyApplicationData, VerificationEvidence } from '../types';
import { addPlatform, addStair, connectStairLanding, createEmptyDesign, insertPlatformVertex, movePlatformLayer, moveStair, removePlatform, removeStair, renamePlatform, resizeStairSide, rotatePlatform, selectDesignObject, setPlatformEdgeLength, setPlatformEdgeRole, setPlatformElevation, setPlatformFinish, setPlatformFramingIntent, setPlatformPurpose, setStairConstruction, updatePlatformBoundary } from '../domain/deckDesign';
import type { AddPlatformInput, AddStairInput, ClosedBoundary, DeckDesign } from '../domain/deckDesign';
import type { SiteModel } from '../domain/siteModel';
import type { FramingDesign } from '../domain/framingDesign';
import { recordRedlineResolution, upsertProfessionalReviewCycle } from '../services/reviewRedlines';

export type ProjectStage = 'idea' | 'property' | 'design' | 'permit' | 'builders';

export interface HomeownerIntent {
  uses: string[];
  materialPreference: 'unsure' | 'cedar' | 'treated-wood' | 'composite' | 'waterproof';
  desiredFeatures: string[];
  budgetRange: 'unsure' | 'under-15k' | '15k-30k' | '30k-60k' | '60k-plus';
  inspirationNotes: string;
}

export interface BuilderShareConsent {
  schema: 'builder-share-consent/v1';
  shareExactAddress: boolean;
  shareContactDetails: boolean;
  shareDrawings: boolean;
  sharePhotoEvidence: boolean;
  shareProfessionalRecords: boolean;
  preferredContact: 'email' | 'phone' | 'either';
  requestedBuilderCount: 1 | 2 | 3;
  confirmed: boolean;
  recordedAt: string | null;
  designFingerprint: string | null;
}

export interface HomeownerProjectState {
  stage: ProjectStage;
  property: Property;
  site: SiteModel | null;
  intent: HomeownerIntent;
  design: DeckDesign;
  framing: FramingDesign | null;
  reviewPublication: ReviewExchangePublication | null;
  architecturalReviewPublication: ReviewExchangePublication | null;
  reviewIssueRevision: number;
  professionalReviewCycles: ProfessionalReviewCycle[];
  verificationEvidence: VerificationEvidence[];
  sidneyApplication: SidneyApplicationData;
  permitSubmissionHistory: PermitSubmissionRecord[];
  builderShareConsent: BuilderShareConsent;
  designHistory: DeckDesign[];
  designFuture: DeckDesign[];
  loading: boolean;
  error: string | null;
  persistenceStatus: 'loading' | 'saving' | 'saved' | 'error';
  lastSavedAt: string | null;
  setStage: (stage: ProjectStage) => void;
  setProperty: (property: Property) => void;
  setSite: (site: SiteModel) => void;
  updateIntent: (intent: Partial<HomeownerIntent>) => void;
  replaceDesign: (design: DeckDesign) => void;
  setFraming: (framing: FramingDesign | null) => void;
  setReviewPublication: (publication: ReviewExchangePublication | null) => void;
  setArchitecturalReviewPublication: (publication: ReviewExchangePublication | null) => void;
  importProfessionalReview: (evidence: VerificationEvidence, cycle: ProfessionalReviewCycle) => void;
  addVerificationEvidence: (evidence: VerificationEvidence) => void;
  updateSidneyApplication: (changes: Partial<SidneyApplicationData>) => void;
  recordPermitSubmission: (record: PermitSubmissionRecord) => void;
  updateBuilderSharePreferences: (changes: Partial<Omit<BuilderShareConsent, 'schema' | 'confirmed' | 'recordedAt' | 'designFingerprint'>>) => void;
  recordBuilderShareConsent: (confirmed: boolean, designFingerprint?: string) => void;
  resolveReviewRedline: (input: { cycleId: string; redlineId: string; targetDesignFingerprint: string; disposition: ReviewRedlineResolution['disposition']; response: string }) => void;
  addPlatform: (input: AddPlatformInput) => void;
  updatePlatformBoundary: (platformId: string, boundary: ClosedBoundary) => void;
  setPlatformElevation: (platformId: string, elevationMm: number) => void;
  setPlatformPurpose: (platformId: string, purpose: 'deck' | 'landing') => void;
  renamePlatform: (platformId: string, name: string) => void;
  setPlatformFinish: (platformId: string, finish: Parameters<typeof setPlatformFinish>[2]) => void;
  setPlatformFramingIntent: (platformId: string, framingIntent: Parameters<typeof setPlatformFramingIntent>[2]) => void;
  setPlatformEdgeRole: (platformId: string, edgeId: string, role: Parameters<typeof setPlatformEdgeRole>[3]) => void;
  setPlatformEdgeLength: (platformId: string, edgeId: string, lengthMm: number) => void;
  insertPlatformVertex: (platformId: string, edgeId: string) => void;
  movePlatformLayer: (platformId: string, delta: -1 | 1) => void;
  rotatePlatform: (platformId: string, deltaDeg: number) => void;
  removePlatform: (platformId: string) => void;
  removeStair: (stairId: string) => void;
  moveStair: (stairId: string, deltaXmm: number, deltaYmm: number) => void;
  resizeStairSide: (stairId: string, side: 'left' | 'right', widthMm: number) => void;
  setStairConstruction: (stairId: string, changes: Parameters<typeof setStairConstruction>[2]) => void;
  connectStairLanding: (stairId: string, platformId: string) => void;
  addStair: (input: AddStairInput) => void;
  selectObject: (objectId: string | null) => void;
  undoDesign: () => void;
  redoDesign: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  resetProject: () => void;
}

export const emptyProperty: Property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] };
export const emptyIntent: HomeownerIntent = { uses: [], materialPreference: 'unsure', desiredFeatures: [], budgetRange: 'unsure', inspirationNotes: '' };
export const emptyBuilderShareConsent: BuilderShareConsent = { schema: 'builder-share-consent/v1', shareExactAddress: false, shareContactDetails: false, shareDrawings: true, sharePhotoEvidence: false, shareProfessionalRecords: true, preferredContact: 'either', requestedBuilderCount: 3, confirmed: false, recordedAt: null, designFingerprint: null };
export const emptySidneyApplication: SidneyApplicationData = { civicAddress: '', ownerName: '', ownerCompany: '', ownerAddress: '', ownerCityProvince: '', ownerPostalCode: '', ownerPhone: '', ownerEmail: '', applicantName: '', applicantCompany: '', applicantBusinessLicence: '', applicantAddress: '', applicantCityProvince: '', applicantPostalCode: '', applicantPhone: '', applicantEmail: '', projectDescription: '', constructionValue: '', existingFloorAreaSqm: '', deckAreaSqm: '', authorizeTownTitleSearch: false };

const freshState = () => ({
  stage: 'idea' as ProjectStage,
  property: emptyProperty,
  site: null,
  intent: emptyIntent,
  design: createEmptyDesign(),
  framing: null as FramingDesign | null,
  reviewPublication: null as ReviewExchangePublication | null,
  architecturalReviewPublication: null as ReviewExchangePublication | null,
  reviewIssueRevision: 0,
  professionalReviewCycles: [] as ProfessionalReviewCycle[],
  verificationEvidence: [] as VerificationEvidence[],
  sidneyApplication: emptySidneyApplication,
  permitSubmissionHistory: [] as PermitSubmissionRecord[],
  builderShareConsent: { ...emptyBuilderShareConsent },
  designHistory: [] as DeckDesign[],
  designFuture: [] as DeckDesign[],
  loading: false,
  error: null,
});

export const useHomeownerProject = create<HomeownerProjectState>((set) => ({
  ...freshState(),
  persistenceStatus: 'loading',
  lastSavedAt: null,
  setStage: (stage) => set({ stage }),
  setProperty: (property) => set((state) => ({ property, error: null, reviewPublication: null, architecturalReviewPublication: null, builderShareConsent: invalidateBuilderConsent(state.builderShareConsent), sidneyApplication: { ...state.sidneyApplication, civicAddress: property.address?.fullAddress || state.sidneyApplication.civicAddress } })),
  setSite: (site) => set((state) => ({ site, reviewPublication: null, architecturalReviewPublication: null, builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) })),
  updateIntent: (changes) => set((state) => ({ intent: { ...state.intent, ...changes }, builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) })),
  replaceDesign: (design) => set((state) => commitDesign(state, design)),
  setFraming: (framing) => set((state) => ({ framing, reviewPublication: null, architecturalReviewPublication: null, builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) })),
  setReviewPublication: (reviewPublication) => set((state) => ({
    reviewPublication,
    reviewIssueRevision: reviewPublication ? Math.max(state.reviewIssueRevision, reviewPublication.revision || state.reviewIssueRevision + 1) : state.reviewIssueRevision,
    builderShareConsent: invalidateBuilderConsent(state.builderShareConsent),
  })),
  setArchitecturalReviewPublication: (architecturalReviewPublication) => set((state) => ({
    architecturalReviewPublication,
    reviewIssueRevision: architecturalReviewPublication ? Math.max(state.reviewIssueRevision, architecturalReviewPublication.revision || state.reviewIssueRevision + 1) : state.reviewIssueRevision,
    builderShareConsent: invalidateBuilderConsent(state.builderShareConsent),
  })),
  importProfessionalReview: (evidence, cycle) => set((state) => ({
    verificationEvidence: [...state.verificationEvidence.filter((item) => item.id !== evidence.id), evidence],
    professionalReviewCycles: upsertProfessionalReviewCycle(state.professionalReviewCycles, cycle),
    builderShareConsent: invalidateBuilderConsent(state.builderShareConsent),
  })),
  addVerificationEvidence: (evidence) => set((state) => ({ verificationEvidence: [...state.verificationEvidence.filter((item) => item.id !== evidence.id), evidence], builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) })),
  updateSidneyApplication: (changes) => set((state) => ({ sidneyApplication: { ...state.sidneyApplication, ...changes }, builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) })),
  recordPermitSubmission: (record) => set((state) => ({ permitSubmissionHistory: [...state.permitSubmissionHistory.filter((item) => item.id !== record.id), record], builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) })),
  updateBuilderSharePreferences: (changes) => set((state) => ({ builderShareConsent: { ...state.builderShareConsent, ...changes, confirmed: false, recordedAt: null, designFingerprint: null } })),
  recordBuilderShareConsent: (confirmed, designFingerprint) => set((state) => ({ builderShareConsent: { ...state.builderShareConsent, confirmed: Boolean(confirmed && designFingerprint), recordedAt: confirmed && designFingerprint ? new Date().toISOString() : null, designFingerprint: confirmed && designFingerprint ? designFingerprint : null } })),
  resolveReviewRedline: (input) => set((state) => ({ professionalReviewCycles: recordRedlineResolution(state.professionalReviewCycles, input), builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) })),
  addPlatform: (input) => set((state) => commitDesign(state, addPlatform(state.design, input))),
  updatePlatformBoundary: (platformId, boundary) => set((state) => commitDesign(state, updatePlatformBoundary(state.design, platformId, boundary))),
  setPlatformElevation: (platformId, elevationMm) => set((state) => commitDesign(state, setPlatformElevation(state.design, platformId, elevationMm))),
  setPlatformPurpose: (platformId, purpose) => set((state) => commitDesign(state, setPlatformPurpose(state.design, platformId, purpose))),
  renamePlatform: (platformId, name) => set((state) => commitDesign(state, renamePlatform(state.design, platformId, name))),
  setPlatformFinish: (platformId, finish) => set((state) => commitDesign(state, setPlatformFinish(state.design, platformId, finish))),
  setPlatformFramingIntent: (platformId, framingIntent) => set((state) => commitDesign(state, setPlatformFramingIntent(state.design, platformId, framingIntent))),
  setPlatformEdgeRole: (platformId, edgeId, role) => set((state) => commitDesign(state, setPlatformEdgeRole(state.design, platformId, edgeId, role))),
  setPlatformEdgeLength: (platformId, edgeId, lengthMm) => set((state) => commitDesign(state, setPlatformEdgeLength(state.design, platformId, edgeId, lengthMm))),
  insertPlatformVertex: (platformId, edgeId) => set((state) => commitDesign(state, insertPlatformVertex(state.design, platformId, edgeId))),
  movePlatformLayer: (platformId, delta) => set((state) => commitDesign(state, movePlatformLayer(state.design, platformId, delta))),
  rotatePlatform: (platformId, deltaDeg) => set((state) => commitDesign(state, rotatePlatform(state.design, platformId, deltaDeg))),
  removePlatform: (platformId) => set((state) => commitDesign(state, removePlatform(state.design, platformId))),
  removeStair: (stairId) => set((state) => commitDesign(state, removeStair(state.design, stairId))),
  moveStair: (stairId, deltaXmm, deltaYmm) => set((state) => commitDesign(state, moveStair(state.design, stairId, deltaXmm, deltaYmm))),
  resizeStairSide: (stairId, side, widthMm) => set((state) => commitDesign(state, resizeStairSide(state.design, stairId, side, widthMm))),
  setStairConstruction: (stairId, changes) => set((state) => commitDesign(state, setStairConstruction(state.design, stairId, changes))),
  connectStairLanding: (stairId, platformId) => set((state) => commitDesign(state, connectStairLanding(state.design, stairId, platformId))),
  addStair: (input) => set((state) => commitDesign(state, addStair(state.design, input))),
  selectObject: (objectId) => set((state) => ({ design: selectDesignObject(state.design, objectId) })),
  undoDesign: () => set((state) => {
    const previous = state.designHistory[state.designHistory.length - 1];
    if (!previous) return state;
    return { design: previous, designHistory: state.designHistory.slice(0, -1), designFuture: [state.design, ...state.designFuture], reviewPublication: null, architecturalReviewPublication: null, builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) };
  }),
  redoDesign: () => set((state) => {
    const next = state.designFuture[0];
    if (!next) return state;
    return { design: next, designHistory: [...state.designHistory, state.design].slice(-50), designFuture: state.designFuture.slice(1), reviewPublication: null, architecturalReviewPublication: null, builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) };
  }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  resetProject: () => set({ ...freshState(), persistenceStatus: 'saved', lastSavedAt: null }),
}));

function commitDesign(state: Pick<HomeownerProjectState, 'design' | 'designHistory' | 'builderShareConsent'>, design: DeckDesign) {
  return { design, designHistory: [...state.designHistory, state.design].slice(-50), designFuture: [] as DeckDesign[], error: null, reviewPublication: null, architecturalReviewPublication: null, builderShareConsent: invalidateBuilderConsent(state.builderShareConsent) };
}

function invalidateBuilderConsent(consent: BuilderShareConsent): BuilderShareConsent {
  return consent.confirmed || consent.recordedAt || consent.designFingerprint ? { ...consent, confirmed: false, recordedAt: null, designFingerprint: null } : consent;
}
