import { useEffect, useState, type ReactNode } from 'react';
import { Check, FileCheck2, FileText, Hammer, Home, Lightbulb, MapPin, Menu, PencilRuler, Save, X } from 'lucide-react';
import { assessDesign } from './domain/deckDesign';
import { generateFramingDesign, isFramingStale, type GenerateFramingInput } from './domain/framingDesign';
import { addCaptureEvidence, addTerrainGradePoint, assessExistingConditionCapture, assessSiteModel, createExistingConditionCapture, createSiteModel, flipHouseWallDirection, recordAiPhotoAnalysis, removeCaptureEvidence, removeTerrainGradePoint, reviewAiPhotoObservation, rotateHouseWallAlignment, selectHouseWall, updateCaptureEvidence, updateSiteModel, updateTerrainGradePoint, type CaptureCategory, type CaptureEvidence, type CaptureEvidenceChanges } from './domain/siteModel';
import { lookupProperty, lookupPropertyFromAddress, PropertyLookupError, suggestAddresses } from './services/propertyLookup';
import { lookupSnowLoad, lookupZoning } from './services/zoning';
import { generateCanonicalPlanSet } from './services/canonicalPlanSet';
import { downloadVectorPlanPdf } from './services/vectorPlanPdf';
import { downloadProjectCadExchange } from './services/projectCadExchange';
import { buildCanonicalCalculationReport, downloadCanonicalCalculationPdf } from './services/canonicalCalculationReport';
import { useHomeownerProject, type ProjectStage } from './state/homeownerProjectStore';
import { IdeaStage } from './components/homeowner/IdeaStage';
import { PropertyStage, type PropertyResearchState } from './components/homeowner/PropertyStage';
import { DesignStage } from './components/homeowner/DesignStage';
import { PermitStage } from './components/homeowner/PermitStage';
import { BuildersStage } from './components/homeowner/BuildersStage';
import type { Address } from './types';
import { captureEvidenceFromFile, deleteCaptureFile, loadCaptureFile, saveCaptureFile } from './services/captureFileStorage';
import { analyzeCapturePhotos } from './services/aiDesignStudio';

const STAGES: Array<{ id: ProjectStage; label: string; description: string; icon: ReactNode }> = [
  { id: 'idea', label: 'Idea', description: 'Goals & inspiration', icon: <Lightbulb size={15} /> },
  { id: 'property', label: 'Property', description: 'Lot & house evidence', icon: <MapPin size={15} /> },
  { id: 'design', label: 'Design', description: 'Platforms & levels', icon: <PencilRuler size={15} /> },
  { id: 'permit', label: 'Permit', description: 'Plans & review', icon: <FileText size={15} /> },
  { id: 'builders', label: 'Builders', description: 'Consent-based matching', icon: <Hammer size={15} /> },
];

/** Application module: composes the homeowner journey and provider effects around canonical project state. */
export function App() {
  const project = useHomeownerProject();
  const [navOpen, setNavOpen] = useState(false);
  const [research, setResearch] = useState<PropertyResearchState>(() => project.property.parcel ? { status: 'success' } : { status: 'idle' });
  const [capturePreviewUrls, setCapturePreviewUrls] = useState<Record<string, string>>({});
  const designAssessment = assessDesign(project.design);
  const siteAssessment = project.site ? assessSiteModel(project.site) : { errors: ['Confirm the existing house reference.'], warnings: [] };
  const activeStage = normalizeStage(project.stage, Boolean(project.site), project.design.platforms.length > 0);
  const framingInput: GenerateFramingInput = { municipality: project.property.parcel?.municipality || project.property.address?.locality || 'British Columbia', snowLoadKpa: project.property.snowLoad };
  const framingStale = project.site ? isFramingStale(project.framing, project.design, project.site, framingInput) : true;
  const captureAssessment = assessExistingConditionCapture(project.site?.capture || createExistingConditionCapture(), { hasDoor: Boolean(project.site?.designWall.openings.some((opening) => opening.kind === 'door')) });

  useEffect(() => {
    const records = project.site?.capture.evidence || [];
    let active = true;
    const allocatedUrls: string[] = [];
    void Promise.all(records.map(async (record) => {
      const stored = await loadCaptureFile(record.id);
      if (!stored) return null;
      const url = URL.createObjectURL(stored.blob);
      allocatedUrls.push(url);
      return [record.id, url] as const;
    })).then((entries) => { if (active) setCapturePreviewUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)))); }).catch(() => { if (active) setCapturePreviewUrls({}); });
    return () => { active = false; allocatedUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [project.site?.capture.evidence]);

  const generateFraming = () => {
    if (!project.site) return;
    try { project.setFraming(generateFramingDesign(project.design, project.site, framingInput)); }
    catch (reason) { project.setError(reason instanceof Error ? reason.message : 'The framing proposal could not be generated.'); }
  };

  const currentReviewSheets = () => {
    if (!project.site || !project.framing || framingStale) throw new Error('Regenerate the framing graph before issuing the coordinated review set.');
    return generateCanonicalPlanSet({ property: project.property, site: project.site, design: project.design, framing: project.framing }).sheets;
  };

  const downloadReviewSet = async () => {
    try { await downloadVectorPlanPdf(project.property, currentReviewSheets()); }
    catch (reason) {
      const error = reason instanceof Error ? reason : new Error('The review PDF could not be downloaded.');
      project.setError(error.message);
      throw error;
    }
  };

  const downloadCadExchange = () => {
    if (!project.site || !project.framing || framingStale) throw new Error('Regenerate the framing graph before exporting the coordinated CAD model.');
    try { downloadProjectCadExchange({ property: project.property, site: project.site, design: project.design, framing: project.framing }); }
    catch (reason) {
      const error = reason instanceof Error ? reason : new Error('The layered DXF could not be downloaded.');
      project.setError(error.message);
      throw error;
    }
  };

  const downloadCalculationReport = async () => {
    if (!project.site || !project.framing || framingStale) throw new Error('Regenerate the framing graph before exporting the coordinated calculation report.');
    try {
      const report = buildCanonicalCalculationReport({ property: project.property, site: project.site, design: project.design, framing: project.framing });
      await downloadCanonicalCalculationPdf(report);
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error('The calculation report could not be downloaded.');
      project.setError(error.message);
      throw error;
    }
  };

  const researchProperty = async (addressText: string, candidate?: Address) => {
    setResearch({ status: 'loading' });
    project.setError(null);
    try {
      const result = candidate ? await lookupPropertyFromAddress(candidate, addressText) : await lookupProperty(addressText);
      let zoning = null;
      try { zoning = lookupZoning(result.parcel); } catch { /* Parcel evidence remains useful while jurisdiction rules are unresolved. */ }
      const property = {
        address: result.address,
        parcel: result.parcel,
        buildings: result.buildings,
        evidence: result.evidence,
        zoning,
        // Yard orientation is selected explicitly from the parcel plan. Do not
        // invent a front yard from latitude or a rectangular bounding box.
        buildableEnvelope: null,
        snowLoad: lookupSnowLoad(result.address.coordinates[1], result.address.coordinates[0]),
      };
      project.setProperty(property);
      project.setSite(createSiteModel(property));
      setResearch({ status: 'success' });
    } catch (reason) {
      setResearch({ status: 'error', message: reason instanceof Error ? reason.message : 'Property research failed.', suggestions: reason instanceof PropertyLookupError ? reason.suggestions : [] });
    }
  };

  const addCaptureFiles = async (category: CaptureCategory, files: File[]) => {
    const admitted: Array<{ record: CaptureEvidence; file: File }> = [];
    try {
      for (const file of files) {
        const record = await captureEvidenceFromFile(file, category);
        await saveCaptureFile(record, file);
        admitted.push({ record, file });
      }
      const current = useHomeownerProject.getState();
      if (!current.site) throw new Error('Research a property before adding house photos.');
      const capture = admitted.reduce((next, item) => addCaptureEvidence(next, item.record), current.site.capture);
      current.setSite(updateSiteModel(current.site, { capture }));
    } catch (reason) {
      await Promise.all(admitted.map((item) => deleteCaptureFile(item.record.id).catch(() => undefined)));
      throw reason;
    }
  };

  const removeCapture = async (evidenceId: string) => {
    await deleteCaptureFile(evidenceId);
    const current = useHomeownerProject.getState();
    if (current.site) current.setSite(updateSiteModel(current.site, { capture: removeCaptureEvidence(current.site.capture, evidenceId) }));
  };

  const reviseCapture = (evidenceId: string, changes: CaptureEvidenceChanges) => {
    const current = useHomeownerProject.getState();
    if (current.site) current.setSite(updateSiteModel(current.site, { capture: updateCaptureEvidence(current.site.capture, evidenceId, changes) }));
  };

  const analyzeCapture = async () => {
    const current = useHomeownerProject.getState();
    if (!current.site) throw new Error('Research a property before analyzing house photos.');
    const analysis = await analyzeCapturePhotos(current.site.capture.evidence, { address: current.property.address?.fullAddress || 'Unconfirmed address', designWallLabel: current.site.designWall.label });
    current.setSite(updateSiteModel(current.site, { capture: recordAiPhotoAnalysis(current.site.capture, analysis) }));
  };

  const reviewCaptureObservation = (analysisId: string, observationId: string, decision: 'homeowner-accepted' | 'homeowner-rejected') => {
    const current = useHomeownerProject.getState();
    if (current.site) current.setSite(updateSiteModel(current.site, { capture: reviewAiPhotoObservation(current.site.capture, analysisId, observationId, decision) }));
  };

  const navigate = (stage: ProjectStage) => {
    if (!stageAvailable(stage, Boolean(project.site), project.design.platforms.length > 0)) return;
    if ((stage === 'permit' || stage === 'builders') && framingStale) generateFraming();
    project.setStage(stage);
    setNavOpen(false);
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" className="icon-button lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open project navigation"><Menu size={18} /></button>
        <div className="brand-mark" aria-hidden="true"><Home size={17} strokeWidth={2.4} /></div>
        <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-semibold text-ink">Permitly</h1><span className="beta-badge">DESIGN LAB</span></div><p className="truncate text-xs text-muted">{project.property.address?.fullAddress || 'New homeowner deck project'}</p></div>
      </div>
      <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><Save size={14} /><span>{saveLabel(project.persistenceStatus, project.lastSavedAt)}</span></div>
      <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{project.design.platforms.length ? `${designAssessment.areaSqM.toFixed(1)} m² design` : 'Plan-first workflow'}</div>
    </header>

    <div className="workspace">
      <aside className={`workflow-rail ${navOpen ? 'workflow-rail-open' : ''}`}>
        <div className="workflow-heading"><div><p className="eyebrow">Homeowner journey</p><h2>Deck project</h2></div><button type="button" className="icon-button lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <nav aria-label="Deck project stages" className="workflow-nav">
          <p className="mx-2 mb-3 text-[10px] leading-4 text-slate-500">Design once. Use the same project for code checks, drawings, permits, and builder quotes.</p>
          {STAGES.map((stage, index) => {
            const available = stageAvailable(stage.id, Boolean(project.site), project.design.platforms.length > 0);
            const currentIndex = STAGES.findIndex((item) => item.id === activeStage);
            const complete = index < currentIndex && available;
            return <button key={stage.id} type="button" onClick={() => navigate(stage.id)} disabled={!available} aria-current={activeStage === stage.id ? 'step' : undefined} className={`workflow-item ${activeStage === stage.id ? 'workflow-item-active' : ''}`}><span className={`step-dot ${complete ? 'step-dot-complete' : ''}`}>{complete ? <Check size={12} strokeWidth={3} /> : stage.icon}</span><span className="min-w-0 text-left"><strong>{stage.label}</strong><small>{stage.description}</small></span></button>;
          })}
        </nav>
        <div className="workflow-footer"><FileCheck2 size={17} /><div><strong>One project graph</strong><span>Measured inputs → plans → permit</span></div></div>
      </aside>

      <div className="min-w-0 flex-1">
        {activeStage === 'idea' && <IdeaStage intent={project.intent} onChange={project.updateIntent} onContinue={() => navigate('property')} />}
        {activeStage === 'property' && <PropertyStage property={project.property} site={project.site} research={research} onResearch={(address) => void researchProperty(address)} onResearchAddress={(address) => void researchProperty(address.fullAddress, address)} onSuggestAddresses={suggestAddresses} onSelectWall={(buildingId, edgeIndex) => { if (project.site) { try { project.setSite(selectHouseWall(project.site, project.property, buildingId, edgeIndex)); } catch (reason) { project.setError(reason instanceof Error ? reason.message : 'The house wall could not be selected.'); } } }} onUpdateSite={(changes, wallChanges) => { if (project.site) project.setSite(updateSiteModel(project.site, changes, wallChanges)); }} onUpdateTerrainDatum={(changes) => { if (project.site) project.setSite(updateSiteModel(project.site, { terrain: { ...project.site.terrain, datum: { ...project.site.terrain.datum, ...changes } } })); }} onAddTerrainPoint={(point) => { if (project.site) project.setSite(updateSiteModel(project.site, { terrain: addTerrainGradePoint(project.site.terrain, point) })); }} onUpdateTerrainPoint={(pointId, changes) => { if (project.site) project.setSite(updateSiteModel(project.site, { terrain: updateTerrainGradePoint(project.site.terrain, pointId, changes) })); }} onRemoveTerrainPoint={(pointId) => { if (project.site) project.setSite(updateSiteModel(project.site, { terrain: removeTerrainGradePoint(project.site.terrain, pointId) })); }} captureAssessment={captureAssessment} capturePreviewUrls={capturePreviewUrls} onAddCaptureFiles={addCaptureFiles} onUpdateCaptureEvidence={reviseCapture} onRemoveCaptureEvidence={removeCapture} onAnalyzeCapture={analyzeCapture} onReviewAiObservation={reviewCaptureObservation} onContinue={() => navigate('design')} />}
        {activeStage === 'design' && project.site && <DesignStage design={project.design} site={project.site} property={project.property} intent={project.intent} assessment={designAssessment} canUndo={project.designHistory.length > 0} canRedo={project.designFuture.length > 0} onAddPlatform={project.addPlatform} onUpdatePlatformBoundary={project.updatePlatformBoundary} onRotatePlatform={project.rotatePlatform} onSelectObject={project.selectObject} onRenamePlatform={project.renamePlatform} onSetElevation={project.setPlatformElevation} onSetPurpose={project.setPlatformPurpose} onSetFinish={project.setPlatformFinish} onSetFramingIntent={project.setPlatformFramingIntent} onSetEdgeRole={project.setPlatformEdgeRole} onSetEdgeLength={project.setPlatformEdgeLength} onInsertVertex={project.insertPlatformVertex} onAddStair={project.addStair} onMovePlatformLayer={project.movePlatformLayer} onRemovePlatform={project.removePlatform} onRemoveStair={project.removeStair} onMoveStair={project.moveStair} onResizeStairSide={project.resizeStairSide} onSetStairConstruction={project.setStairConstruction} onConnectStairLanding={project.connectStairLanding} onUndo={project.undoDesign} onRedo={project.redoDesign} onOpenProperty={() => navigate('property')} onMirrorProperty={() => project.setSite(flipHouseWallDirection(project.site!))} onRotateProperty={() => project.setSite(rotateHouseWallAlignment(project.site!))} onApplyAiDesign={project.replaceDesign} onContinue={() => navigate('permit')} />}
        {activeStage === 'permit' && project.site && <PermitStage property={project.property} site={project.site} design={project.design} framing={project.framing} framingStale={framingStale} designErrors={designAssessment.errors.map((issue) => issue.message)} siteErrors={siteAssessment.errors} siteWarnings={siteAssessment.warnings} reviewPublication={project.reviewPublication} reviewIssueRevision={project.reviewIssueRevision} professionalReviewCycles={project.professionalReviewCycles} verificationEvidence={project.verificationEvidence} sidneyApplication={project.sidneyApplication} permitSubmissionHistory={project.permitSubmissionHistory} onGenerateFraming={generateFraming} onDownloadReviewSet={downloadReviewSet} onDownloadCadExchange={downloadCadExchange} onDownloadCalculationReport={downloadCalculationReport} onBackToDesign={() => navigate('design')} onContinue={() => navigate('builders')} onPublishReview={project.setReviewPublication} onImportReview={project.importProfessionalReview} onAddVerificationEvidence={project.addVerificationEvidence} onUpdateSidneyApplication={project.updateSidneyApplication} onRecordPermitSubmission={project.recordPermitSubmission} onResolveRedline={project.resolveReviewRedline} />}
        {activeStage === 'builders' && project.site && <BuildersStage property={project.property} site={project.site} design={project.design} framing={project.framing} framingStale={framingStale} intent={project.intent} consent={project.builderShareConsent} application={project.sidneyApplication} reviewPublication={project.reviewPublication} reviewIssueRevision={project.reviewIssueRevision} reviewCycles={project.professionalReviewCycles} verificationEvidence={project.verificationEvidence} permitSubmissionHistory={project.permitSubmissionHistory} onUpdateConsent={project.updateBuilderSharePreferences} onRecordConsent={project.recordBuilderShareConsent} onBack={() => navigate('permit')} />}
      </div>
    </div>
    {navOpen && <button type="button" className="mobile-scrim lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close navigation" />}
    {project.error && <div className="fixed bottom-4 left-1/2 z-[70] flex max-w-lg -translate-x-1/2 items-start gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-800 shadow-2xl" role="alert"><span className="flex-1">{project.error}</span><button type="button" onClick={() => project.setError(null)} aria-label="Dismiss error"><X size={16} /></button></div>}
  </div>;
}

function normalizeStage(stage: ProjectStage, hasSite: boolean, hasDesign: boolean): ProjectStage {
  if ((stage === 'design' || stage === 'permit' || stage === 'builders') && !hasSite) return 'property';
  if ((stage === 'permit' || stage === 'builders') && !hasDesign) return 'design';
  return stage;
}
function stageAvailable(stage: ProjectStage, hasSite: boolean, hasDesign: boolean): boolean {
  if (stage === 'idea' || stage === 'property') return true;
  if (stage === 'design') return hasSite;
  return hasSite && hasDesign;
}
function saveLabel(status: 'loading' | 'saving' | 'saved' | 'error', lastSavedAt: string | null): string {
  if (status === 'loading') return 'Loading saved project…';
  if (status === 'saving') return 'Saving…';
  if (status === 'error') return 'Local save unavailable';
  return lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Saved on this device';
}
