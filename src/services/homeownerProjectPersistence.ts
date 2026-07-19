import { useHomeownerProject } from '../state/homeownerProjectStore';
import type { BuilderShareConsent, HomeownerIntent, ProjectStage } from '../state/homeownerProjectStore';
import type { PermitSubmissionRecord, ProfessionalReviewCycle, Property, ReviewExchangePublication, SidneyApplicationData, VerificationEvidence } from '../types';
import { emptyBuilderShareConsent, emptySidneyApplication } from '../state/homeownerProjectStore';
import type { DeckDesign } from '../domain/deckDesign';
import { createExistingConditionCapture, createTerrainSurface, type SiteModel } from '../domain/siteModel';
import type { FramingDesign } from '../domain/framingDesign';

const STORAGE_KEY = 'permitly-homeowner-project-v1';
let initialized = false;
let timer: ReturnType<typeof setTimeout> | null = null;

interface Snapshot {
  schema: 'homeowner-project/v1';
  savedAt: string;
  stage: ProjectStage;
  property: Property;
  site: SiteModel | null;
  intent: HomeownerIntent;
  design: DeckDesign;
  framing?: FramingDesign | null;
  reviewPublication?: ReviewExchangePublication | null;
  reviewIssueRevision?: number;
  professionalReviewCycles?: ProfessionalReviewCycle[];
  verificationEvidence?: VerificationEvidence[];
  sidneyApplication?: SidneyApplicationData;
  permitSubmissionHistory?: PermitSubmissionRecord[];
  builderShareConsent?: BuilderShareConsent;
}

export function initializeHomeownerProjectPersistence(): void {
  if (initialized) return;
  initialized = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const snapshot = raw ? JSON.parse(raw) as Partial<Snapshot> : null;
    if (snapshot?.schema === 'homeowner-project/v1' && snapshot.design?.schema === 'deck-design/v1' && snapshot.property && snapshot.intent && snapshot.stage) {
      useHomeownerProject.setState({ stage: snapshot.stage, property: snapshot.property, site: snapshot.site ? normalizeSite(snapshot.site) : null, intent: snapshot.intent, design: normalizeDesign(snapshot.design), framing: snapshot.framing?.schema === 'framing-design/v2' && snapshot.framing.lifeSafety?.schema === 'life-safety-screen/v2' ? snapshot.framing : null, reviewPublication: snapshot.reviewPublication || null, reviewIssueRevision: snapshot.reviewIssueRevision || snapshot.reviewPublication?.revision || 0, professionalReviewCycles: snapshot.professionalReviewCycles || [], verificationEvidence: snapshot.verificationEvidence || [], sidneyApplication: snapshot.sidneyApplication || { ...emptySidneyApplication, civicAddress: snapshot.property.address?.fullAddress || '' }, permitSubmissionHistory: snapshot.permitSubmissionHistory || [], builderShareConsent: normalizeBuilderShareConsent(snapshot.builderShareConsent), persistenceStatus: 'saved', lastSavedAt: snapshot.savedAt || null });
    } else useHomeownerProject.setState({ persistenceStatus: 'saved' });
  } catch {
    useHomeownerProject.setState({ persistenceStatus: 'error' });
  }
  useHomeownerProject.subscribe((state, previous) => {
    if (state.stage === previous.stage && state.property === previous.property && state.site === previous.site && state.intent === previous.intent && state.design === previous.design && state.framing === previous.framing && state.reviewPublication === previous.reviewPublication && state.reviewIssueRevision === previous.reviewIssueRevision && state.professionalReviewCycles === previous.professionalReviewCycles && state.verificationEvidence === previous.verificationEvidence && state.sidneyApplication === previous.sidneyApplication && state.permitSubmissionHistory === previous.permitSubmissionHistory && state.builderShareConsent === previous.builderShareConsent) return;
    if (timer) clearTimeout(timer);
    useHomeownerProject.setState({ persistenceStatus: 'saving' });
    timer = setTimeout(() => {
      const savedAt = new Date().toISOString();
      const current = useHomeownerProject.getState();
      const snapshot: Snapshot = { schema: 'homeowner-project/v1', savedAt, stage: current.stage, property: current.property, site: current.site, intent: current.intent, design: current.design, framing: current.framing, reviewPublication: current.reviewPublication, reviewIssueRevision: current.reviewIssueRevision, professionalReviewCycles: current.professionalReviewCycles, verificationEvidence: current.verificationEvidence, sidneyApplication: current.sidneyApplication, permitSubmissionHistory: current.permitSubmissionHistory, builderShareConsent: current.builderShareConsent };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        useHomeownerProject.setState({ persistenceStatus: 'saved', lastSavedAt: savedAt });
      } catch {
        useHomeownerProject.setState({ persistenceStatus: 'error' });
      }
    }, 250);
  });
}

function normalizeBuilderShareConsent(consent?: BuilderShareConsent): BuilderShareConsent {
  if (consent?.schema !== 'builder-share-consent/v1') return { ...emptyBuilderShareConsent };
  const confirmed = Boolean(consent.confirmed && consent.recordedAt && consent.designFingerprint);
  return { ...emptyBuilderShareConsent, ...consent, confirmed, recordedAt: confirmed ? consent.recordedAt : null, designFingerprint: confirmed ? consent.designFingerprint : null };
}

function normalizeDesign(design: DeckDesign): DeckDesign {
  return {
    ...design,
    stairs: design.stairs.map((stair) => {
      const radians = stair.directionDeg * Math.PI / 180;
      return {
        ...stair,
        endMm: stair.endMm || [Math.round(stair.startMm[0] + Math.cos(radians) * stair.totalRunMm), Math.round(stair.startMm[1] + Math.sin(radians) * stair.totalRunMm)],
        stringerCount: stair.stringerCount || Math.max(2, Math.ceil(stair.widthMm / 450) + 1),
        handrailSides: stair.handrailSides || (stair.riserCount >= 3 ? 'both' : 'none'),
      };
    }),
  };
}

function normalizeSite(site: SiteModel): SiteModel {
  const legacySite = site as SiteModel & { terrainElevationMm?: number };
  const wall = site.designWall as SiteModel['designWall'] & { label?: string; selectionStatus?: SiteModel['designWall']['selectionStatus'] };
  const syntheticStarterDoor = site.status === 'reference-unverified'
    && wall.openings.length === 1
    && wall.openings[0].id === 'D1'
    && wall.openings[0].widthMm === 900
    && wall.openings[0].sillHeightMm === 675;
  return {
    ...site,
    schema: 'site-model/v4',
    terrain: site.terrain?.schema === 'terrain-surface/v1' ? site.terrain : createTerrainSurface(legacySite.terrainElevationMm || 0),
    yardReference: site.yardReference?.schema === 'parcel-yard-reference/v1' ? { ...site.yardReference, rearEdgeIndex: site.yardReference.rearEdgeIndex ?? null } : { schema: 'parcel-yard-reference/v1', status: 'unselected', frontEdgeIndex: null, rearEdgeIndex: null, exteriorSideEdgeIndex: null, selectedBy: '', selectedAt: '', notes: '' },
    capture: site.capture?.schema === 'existing-condition-capture/v1' ? site.capture : createExistingConditionCapture(),
    designWall: {
      ...wall,
      label: wall.label || 'Unconfirmed house side',
      selectionStatus: wall.selectionStatus || 'unselected',
      reverseDirection: wall.reverseDirection || false,
      invertOutward: wall.invertOutward || false,
      openings: syntheticStarterDoor ? [] : wall.openings.map((opening) => ({
        ...opening,
        heightMm: opening.heightMm || (opening.kind === 'door' ? 2100 : 1200),
        evidenceStatus: opening.evidenceStatus || 'field-measured',
        sourceEvidenceIds: opening.sourceEvidenceIds || [],
      })),
    },
  };
}
