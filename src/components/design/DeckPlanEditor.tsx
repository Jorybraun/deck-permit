import { Check, ChevronDown, CircleDollarSign, FlipHorizontal2, Footprints, Hand, Magnet, Map, Minus, MousePointer2, Pencil, Plus, Redo2, RotateCcw, RotateCw, Ruler, Scan, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { boundaryCenter, boundaryFromPoints, findHighestPlatformBelowPoint, nearestPlatformEdgePoint, proposePointToPointStairGeometry, rotateBoundary, stairDepartureDirection, suggestedPlatformElevationForBoundary } from '../../domain/deckDesign';
import type { AddPlatformInput, ClosedBoundary, DeckDesign, DeckPlatform, DeckStair, PointMm } from '../../domain/deckDesign';
import { deriveReferenceSetbackGuides, projectPropertyToLocal, terrainElevationAt, type LocalPropertyGeometry, type ReferenceSetbackGuide, type SiteModel } from '../../domain/siteModel';
import type { Property } from '../../types';
import { estimateProject } from '../../services/projectEstimate';
import { ANGLE_SNAP_DEG, constrainDraftPoint, formatAngle, interiorAngleDeg, lineAngleDeg, snapDraggedVertex, snapPointToSmartGuides, type SmartGuideResult } from './draftingGeometry';

interface DeckPlanEditorProps {
  design: DeckDesign;
  site: SiteModel;
  property: Property;
  canUndo: boolean;
  canRedo: boolean;
  onAddPlatform: (input: AddPlatformInput) => void;
  onUpdatePlatformBoundary: (platformId: string, boundary: ClosedBoundary) => void;
  onRotatePlatform: (platformId: string, deltaDeg: number) => void;
  onSelectObject: (objectId: string | null) => void;
  onConnectStair: (sourcePlatformId: string, sourceEdgeId: string, sourcePointMm: PointMm, targetPointMm: PointMm, targetPlatformId: string | null, targetEdgeId?: string) => void;
  onSetStairConstruction: (stairId: string, changes: Partial<Pick<DeckStair, 'widthMm' | 'directionDeg'>>) => void;
  onMoveStair: (stairId: string, deltaXmm: number, deltaYmm: number) => void;
  onResizeStairSide: (stairId: string, side: 'left' | 'right', widthMm: number) => void;
  onOpenProperty: () => void;
  onMirrorProperty: () => void;
  onRotateProperty: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

type EditorMode = 'select' | 'draw' | 'insert' | 'remove' | 'stairs' | 'pan';
type ViewMode = 'detail' | 'property';
type DragState = {
  kind: 'move' | 'vertex' | 'edge' | 'rotate';
  platformId: string;
  start: PointMm;
  original: ClosedBoundary;
  vertexIndex?: number;
  edgeIndex?: number;
  pivot?: PointMm;
  startAngleDeg?: number;
};
type PanDragState = { startScreenX: number; startScreenY: number; originalX: number; originalY: number };
type StairDragState = { kind: 'width-left' | 'width-right' | 'direction' | 'move'; stairId: string; startPointerMm: PointMm; original: DeckStair };
type StairPreviewState = { stairId: string; widthMm: number; directionDeg: number; startMm: PointMm; endMm: PointMm };

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 720;
const GRID_MM = 100;
const MIN_ZOOM = .5;
const MAX_ZOOM = 8;

/** UI module: edits architectural platform boundaries without owning durable design state. */
export function DeckPlanEditor({ design, site, property, canUndo, canRedo, onAddPlatform, onUpdatePlatformBoundary, onRotatePlatform, onSelectObject, onConnectStair, onSetStairConstruction, onMoveStair, onResizeStairSide, onOpenProperty, onMirrorProperty, onRotateProperty, onUndo, onRedo }: DeckPlanEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wheelDeltaRef = useRef(0);
  const [mode, setMode] = useState<EditorMode>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('property');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PointMm>([0, 0]);
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);
  const [spacePan, setSpacePan] = useState(false);
  const [angleSnapEnabled, setAngleSnapEnabled] = useState(true);
  const [smartGuidesEnabled, setSmartGuidesEnabled] = useState(true);
  const [draft, setDraft] = useState<PointMm[]>([]);
  const [draftFuture, setDraftFuture] = useState<PointMm[]>([]);
  const [hoverPoint, setHoverPoint] = useState<PointMm | null>(null);
  const [preview, setPreview] = useState<{ platformId: string; boundary: ClosedBoundary; rotationDeltaDeg?: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragRulers, setDragRulers] = useState<SmartGuideResult | null>(null);
  const [stairDrag, setStairDrag] = useState<StairDragState | null>(null);
  const [stairPreview, setStairPreview] = useState<StairPreviewState | null>(null);
  const [message, setMessage] = useState<string>('');
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [stairSource, setStairSource] = useState<{ platformId: string; edgeId: string; pointMm: PointMm } | null>(null);
  const [stairHelpOpen, setStairHelpOpen] = useState(true);
  const [drawHelpOpen, setDrawHelpOpen] = useState(true);
  const propertyGeometry = useMemo(() => projectPropertyToLocal(property, site), [property, site]);
  const setbackGuides = useMemo(() => deriveReferenceSetbackGuides(property, propertyGeometry, site), [property, propertyGeometry, site]);
  const estimate = useMemo(() => estimateProject(design), [design]);
  const transform = useMemo(() => createTransform(design, site, propertyGeometry, viewMode, zoom, pan), [design, site, propertyGeometry, viewMode, zoom, pan]);
  const selectedPlatform = design.platforms.find((platform) => platform.id === design.selectedObjectId) || null;
  const stairSourcePlatform = design.platforms.find((platform) => platform.id === stairSource?.platformId) || null;
  const stairSourceEdgeIndex = stairSourcePlatform?.edges.findIndex((edge) => edge.id === stairSource?.edgeId) ?? -1;
  const sourceGrade = stairSource ? terrainElevationAt(site.terrain, stairSource.pointMm) : null;
  const hoverGrade = hoverPoint ? terrainElevationAt(site.terrain, hoverPoint) : null;
  const stairRiseToGradeMm = stairSourcePlatform ? Math.abs(stairSourcePlatform.elevationMm - (sourceGrade?.elevationMm ?? site.terrain.datum.elevationMm)) : 0;
  const detectedLanding = stairSource && hoverPoint ? findHighestPlatformBelowPoint(design, stairSource.platformId, hoverPoint) : null;
  const stairPreviewRiseMm = stairSourcePlatform ? Math.abs(stairSourcePlatform.elevationMm - (detectedLanding?.elevationMm ?? hoverGrade?.elevationMm ?? site.terrain.datum.elevationMm)) : 0;
  const stairPreviewDirectionDeg = stairSourcePlatform && stairSource ? stairDepartureDirection(stairSourcePlatform, stairSource.edgeId) : 0;

  const screenPointFromClient = (clientX: number, clientY: number): PointMm => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return [0, 0];
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return [point.x, point.y];
  };

  const worldPoint = (event: ReactPointerEvent<SVGSVGElement>): PointMm => {
    const [screenX, screenY] = screenPointFromClient(event.clientX, event.clientY);
    return [snap(transform.fromScreenX(screenX)), snap(transform.fromScreenY(screenY))];
  };

  const worldPointFromClient = (clientX: number, clientY: number): PointMm => {
    const [screenX, screenY] = screenPointFromClient(clientX, clientY);
    return [transform.fromScreenX(screenX), transform.fromScreenY(screenY)];
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (mode === 'pan' || spacePan || event.button === 1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const [screenX, screenY] = screenPointFromClient(event.clientX, event.clientY);
      setPanDrag({ startScreenX: screenX, startScreenY: screenY, originalX: pan[0], originalY: pan[1] });
      return;
    }
    const isBackground = event.target === event.currentTarget || (event.target as Element).getAttribute('data-background') === 'true';
    if (mode === 'stairs' && isBackground) {
      if (!stairSource) { setMessage('Point A must be on a platform edge. Click the edge where the stairs begin.'); return; }
      const targetPoint = worldPoint(event);
      try {
        onConnectStair(stairSource.platformId, stairSource.edgeId, stairSource.pointMm, targetPoint, null);
        setStairSource(null); setHoverPoint(null); setMode('select');
        setMessage('Point-to-point stairs added to the yard. Select the stair callout to inspect its rise, run, treads, stringers, and handrails.');
      } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The stairs could not be placed between those points.'); }
      return;
    }
    if (!isBackground) return;
    if (mode !== 'draw') { onSelectObject(null); return; }
    const constrained = constrainDraftPoint(worldPoint(event), draft, angleSnapEnabled && !event.altKey);
    const first = draft[0];
    const point = first && draft.length >= 3 && distance(constrained, first) <= closeTargetMm(transform.scale) ? first : constrained;
    if (first && draft.length >= 3 && point === first) { finishDrawing(); return; }
    setDraft((current) => [...current, point]);
    setDraftFuture([]);
    setHoverPoint(point);
    setMessage(currentInstruction(draft.length + 1));
  };

  const finishDrawing = () => {
    if (draft.length < 3) { setMessage('Place at least three corners before finishing.'); return; }
    try {
      const boundary = boundaryFromPoints(draft, `D${design.platforms.length + 1}-V`);
      onAddPlatform({ boundary, elevationMm: defaultElevation(design, site, boundary), houseEdgeIndex: houseEdgeIndex(draft) });
      setDraft([]); setDraftFuture([]); setHoverPoint(null); setMode('select'); setMessage('Platform added. Pull an edge, drag a corner, or type an exact edge length.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The platform boundary is invalid.'); }
  };

  const beginDrag = (event: ReactPointerEvent<SVGElement>, platform: DeckPlatform, kind: DragState['kind'], index?: number) => {
    if (mode !== 'select' || spacePan || event.button === 1) return;
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
    const [screenX, screenY] = screenPointFromClient(event.clientX, event.clientY);
    const start: PointMm = [snap(transform.fromScreenX(screenX)), snap(transform.fromScreenY(screenY))];
    setDrag({ kind, platformId: platform.id, start, original: platform.boundary, ...(kind === 'vertex' ? { vertexIndex: index } : {}), ...(kind === 'edge' ? { edgeIndex: index } : {}) });
    setPreview({ platformId: platform.id, boundary: platform.boundary });
    setDragRulers(null);
    onSelectObject(platform.id);
    if (kind === 'vertex') setMessage('Drag the corner. Smart guides align with other nodes and the rulers show X, Y, and direct distances.');
  };

  const beginPlatformRotate = (event: ReactPointerEvent<SVGElement>, platform: DeckPlatform) => {
    if (mode !== 'select' || spacePan || event.button === 1) return;
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
    const pivot = boundaryCenter(platform.boundary);
    const point = worldPointFromClient(event.clientX, event.clientY);
    const startAngleDeg = Math.atan2(point[1] - pivot[1], point[0] - pivot[0]) * 180 / Math.PI;
    setDrag({ kind: 'rotate', platformId: platform.id, start: point, original: platform.boundary, pivot, startAngleDeg });
    setPreview({ platformId: platform.id, boundary: platform.boundary, rotationDeltaDeg: 0 });
    setDragRulers(null);
    onSelectObject(platform.id);
    setMessage(`Rotate ${platform.name}. The angle snaps every ${ANGLE_SNAP_DEG}°; hold Alt for a free angle.`);
  };

  const beginStairDrag = (event: ReactPointerEvent<SVGElement>, stair: DeckStair, kind: StairDragState['kind']) => {
    if (mode !== 'select' || event.button === 1) return;
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
    const point = worldPointFromClient(event.clientX, event.clientY);
    setStairDrag({ kind, stairId: stair.id, startPointerMm: point, original: stair });
    setStairPreview({ stairId: stair.id, widthMm: stair.widthMm, directionDeg: stair.directionDeg, startMm: stair.startMm, endMm: stair.endMm });
    onSelectObject(stair.id);
    setMessage(kind === 'move' ? 'Drag the stair along its platform edge. Point A stays attached and the complete yard stair follows.' : kind.startsWith('width') ? `Drag the ${kind === 'width-left' ? 'left' : 'right'} stair edge. The opposite edge stays fixed.` : 'Swing Point B around Point A to set the plan angle. Hold Alt for a free angle.');
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panDrag) {
      const [screenX, screenY] = screenPointFromClient(event.clientX, event.clientY);
      setPan([panDrag.originalX + screenX - panDrag.startScreenX, panDrag.originalY + screenY - panDrag.startScreenY]);
      return;
    }
    if (stairDrag) {
      const stair = stairDrag.original;
      const point = worldPointFromClient(event.clientX, event.clientY);
      if (stairDrag.kind === 'direction') {
        const rawDirection = Math.atan2(point[1] - stair.startMm[1], point[0] - stair.startMm[0]) * 180 / Math.PI;
        const snappedDirection = angleSnapEnabled && !event.altKey ? Math.round(rawDirection / ANGLE_SNAP_DEG) * ANGLE_SNAP_DEG : rawDirection;
        const directionDeg = normalizePlanDegrees(snappedDirection);
        const radians = directionDeg * Math.PI / 180;
        const endMm: PointMm = stair.to.kind === 'terrain' ? [Math.round(stair.startMm[0] + Math.cos(radians) * stair.totalRunMm), Math.round(stair.startMm[1] + Math.sin(radians) * stair.totalRunMm)] : stair.endMm;
        setStairPreview({ stairId: stair.id, widthMm: stair.widthMm, directionDeg, startMm: stair.startMm, endMm });
      } else if (stairDrag.kind === 'move') {
        const sourcePlatformId = stair.from.kind === 'platform' ? stair.from.platformId : null;
        const sourcePlatform = sourcePlatformId ? design.platforms.find((platform) => platform.id === sourcePlatformId) : null;
        const sourceEdgeIndex = sourcePlatform?.edges.findIndex((edge) => edge.id === stair.fromEdgeId) ?? -1;
        const desiredStart: PointMm = [stair.startMm[0] + point[0] - stairDrag.startPointerMm[0], stair.startMm[1] + point[1] - stairDrag.startPointerMm[1]];
        const startMm = sourcePlatform && sourceEdgeIndex >= 0 ? pointOnEdge(sourcePlatform, sourceEdgeIndex, desiredStart) : desiredStart;
        const dx = startMm[0] - stair.startMm[0]; const dy = startMm[1] - stair.startMm[1];
        const endMm: PointMm = [stair.endMm[0] + dx, stair.endMm[1] + dy];
        setStairPreview({ stairId: stair.id, widthMm: stair.widthMm, directionDeg: stair.directionDeg, startMm, endMm });
      } else {
        const radians = stair.directionDeg * Math.PI / 180;
        const normalX = -Math.sin(radians); const normalY = Math.cos(radians);
        const lateral = (point[0] - stair.startMm[0]) * normalX + (point[1] - stair.startMm[1]) * normalY;
        const rawWidth = stairDrag.kind === 'width-left' ? stair.widthMm / 2 - lateral : lateral + stair.widthMm / 2;
        const widthMm = Math.max(860, Math.min(4800, Math.round(rawWidth / 50) * 50));
        const centreShift = (stairDrag.kind === 'width-left' ? stair.widthMm - widthMm : widthMm - stair.widthMm) / 2;
        const dx = Math.round(normalX * centreShift); const dy = Math.round(normalY * centreShift);
        setStairPreview({ stairId: stair.id, widthMm, directionDeg: stair.directionDeg, startMm: [stair.startMm[0] + dx, stair.startMm[1] + dy], endMm: [stair.endMm[0] + dx, stair.endMm[1] + dy] });
      }
      return;
    }
    if (!drag) {
      if (mode === 'draw' && draft.length > 0) {
        const constrained = constrainDraftPoint(worldPoint(event), draft, angleSnapEnabled && !event.altKey);
        setHoverPoint(draft.length >= 3 && distance(constrained, draft[0]) <= closeTargetMm(transform.scale) ? draft[0] : constrained);
      }
      if (mode === 'stairs' && stairSource) setHoverPoint(worldPoint(event));
      return;
    }
    const point = drag.kind === 'rotate' ? worldPointFromClient(event.clientX, event.clientY) : worldPoint(event);
    if (drag.kind === 'rotate' && drag.pivot && drag.startAngleDeg !== undefined) {
      const currentAngleDeg = Math.atan2(point[1] - drag.pivot[1], point[0] - drag.pivot[0]) * 180 / Math.PI;
      const rawDelta = currentAngleDeg - drag.startAngleDeg;
      const rotationDeltaDeg = angleSnapEnabled && !event.altKey ? Math.round(rawDelta / ANGLE_SNAP_DEG) * ANGLE_SNAP_DEG : rawDelta;
      setPreview({ platformId: drag.platformId, boundary: rotateBoundary(drag.original, rotationDeltaDeg, drag.pivot), rotationDeltaDeg });
      setMessage(`Platform rotation ${rotationDeltaDeg.toFixed(event.altKey ? 1 : 0)}°${event.altKey ? ' · free angle' : ` · snapped ${ANGLE_SNAP_DEG}°`}`);
      return;
    }
    const dx = point[0] - drag.start[0];
    const dy = point[1] - drag.start[1];
    const vertices = drag.original.vertices.map((vertex) => ({ ...vertex }));
    if (drag.kind === 'move') vertices.forEach((vertex) => { vertex.xMm += dx; vertex.yMm += dy; });
    if (drag.kind === 'vertex' && drag.vertexIndex !== undefined) {
      const original = drag.original.vertices[drag.vertexIndex];
      let target = snapDraggedVertex([original.xMm + dx, original.yMm + dy], drag.original.vertices, drag.vertexIndex, angleSnapEnabled && !event.altKey);
      if (smartGuidesEnabled) {
        const movingVertexId = drag.original.vertices[drag.vertexIndex].id;
        const references = design.platforms.flatMap((platform) => platform.boundary.vertices
          .filter((vertex) => platform.id !== drag.platformId || vertex.id !== movingVertexId)
          .map((vertex, index) => ({ id: `${platform.id}:${vertex.id}`, label: `${platform.name} · C${index + 1}`, point: [vertex.xMm, vertex.yMm] as PointMm })));
        const guideResult = snapPointToSmartGuides(target, references, event.altKey ? -1 : Math.min(400, 12 / Math.max(.001, transform.scale)));
        target = guideResult.point;
        setDragRulers(guideResult);
      } else setDragRulers(null);
      vertices[drag.vertexIndex].xMm = target[0]; vertices[drag.vertexIndex].yMm = target[1];
    }
    if (drag.kind === 'edge' && drag.edgeIndex !== undefined) {
      const first = drag.edgeIndex;
      const second = (drag.edgeIndex + 1) % vertices.length;
      const start = drag.original.vertices[first];
      const end = drag.original.vertices[second];
      const edgeX = end.xMm - start.xMm; const edgeY = end.yMm - start.yMm;
      const length = Math.hypot(edgeX, edgeY);
      const normalX = length ? -edgeY / length : 0; const normalY = length ? edgeX / length : 0;
      const shift = snap(dx * normalX + dy * normalY);
      vertices[first].xMm += Math.round(normalX * shift); vertices[first].yMm += Math.round(normalY * shift);
      vertices[second].xMm += Math.round(normalX * shift); vertices[second].yMm += Math.round(normalY * shift);
    }
    if (drag.kind !== 'vertex') setDragRulers(null);
    setPreview({ platformId: drag.platformId, boundary: { ...drag.original, vertices } });
  };

  const finishDrag = () => {
    if (!drag || !preview) return;
    try {
      if (drag.kind === 'rotate') { onRotatePlatform(drag.platformId, preview.rotationDeltaDeg || 0); setMessage(`Platform rotated ${Math.abs(preview.rotationDeltaDeg || 0).toFixed(1)}°.`); }
      else { onUpdatePlatformBoundary(drag.platformId, preview.boundary); setMessage('Dimensions updated.'); }
    }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'That edit creates invalid geometry.'); }
    finally { setDrag(null); setPreview(null); setDragRulers(null); }
  };

  const insertCorner = (event: ReactPointerEvent<SVGLineElement>, platform: DeckPlatform, edgeIndex: number) => {
    event.preventDefault(); event.stopPropagation();
    const point = pointOnEdge(platform, edgeIndex, worldPointFromClient(event.clientX, event.clientY));
    const vertex = { id: `${platform.id}-insert`, xMm: point[0], yMm: point[1] };
    const vertices = platform.boundary.vertices.map((item) => ({ ...item }));
    vertices.splice(edgeIndex + 1, 0, vertex);
    try {
      onUpdatePlatformBoundary(platform.id, { ...platform.boundary, vertices });
      onSelectObject(platform.id);
      setMessage(`Corner ${edgeIndex + 2} added. Drag it to shape the platform or click another edge.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The corner could not be inserted.'); }
  };

  const removeCorner = (event: ReactPointerEvent<SVGCircleElement>, platform: DeckPlatform, vertexIndex: number) => {
    event.preventDefault(); event.stopPropagation();
    if (platform.boundary.vertices.length <= 3) { setMessage('A closed platform needs at least three corners. Remove the platform instead.'); return; }
    const incomingEdgeIndex = (vertexIndex - 1 + platform.edges.length) % platform.edges.length;
    const adjacentEdges = [platform.edges[incomingEdgeIndex], platform.edges[vertexIndex]];
    if (adjacentEdges.some((edge) => edge?.role === 'stair' || design.stairs.some((stair) => stair.fromEdgeId === edge?.id || stair.toEdgeId === edge?.id))) {
      setMessage('This corner belongs to a stair opening. Remove or relocate that stair first.'); return;
    }
    const vertices = platform.boundary.vertices.filter((_vertex, index) => index !== vertexIndex).map((vertex) => ({ ...vertex }));
    try {
      onUpdatePlatformBoundary(platform.id, { ...platform.boundary, vertices });
      onSelectObject(platform.id);
      setMessage(`Corner ${vertexIndex + 1} removed. The two adjacent edges were joined.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'That corner cannot be removed without creating invalid geometry.'); }
  };

  const connectStairAtEdgePoint = (platform: DeckPlatform, edgeIndex: number, pointMm: PointMm) => {
    const edgeId = platform.edges[edgeIndex]?.id;
    if (!edgeId) return;
    if (!stairSource) {
      setStairSource({ platformId: platform.id, edgeId, pointMm });
      onSelectObject(platform.id);
      setHoverPoint(pointMm);
      setMessage(`Point A placed on ${platform.name}. Now click Point B in the yard or on an edge of another platform.`);
      return;
    }
    if (stairSource.platformId === platform.id) { setMessage('Choose a destination edge on a different platform, or connect the selected edge to grade.'); return; }
    try {
      onConnectStair(stairSource.platformId, stairSource.edgeId, stairSource.pointMm, pointMm, platform.id, edgeId);
      setStairSource(null); setHoverPoint(null); setMode('select');
      setMessage(`Point-to-point stairs added to ${platform.name}. Select the stair callout to inspect the complete assembly.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The stairs could not be placed between these levels.'); }
  };

  const connectStairEdge = (event: ReactPointerEvent<SVGLineElement>, platform: DeckPlatform, edgeIndex: number) => {
    event.preventDefault(); event.stopPropagation();
    connectStairAtEdgePoint(platform, edgeIndex, pointOnEdge(platform, edgeIndex, worldPointFromClient(event.clientX, event.clientY)));
  };

  const connectStairMarker = (platform: DeckPlatform, edgeIndex: number) => {
    const start = platform.boundary.vertices[edgeIndex];
    const end = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
    if (!start || !end) return;
    connectStairAtEdgePoint(platform, edgeIndex, [Math.round((start.xMm + end.xMm) / 2), Math.round((start.yMm + end.yMm) / 2)]);
  };

  const connectStairPlatform = (event: ReactPointerEvent<SVGPolygonElement>, clickedPlatform: DeckPlatform) => {
    if (mode !== 'stairs') { beginDrag(event, clickedPlatform, 'move'); return; }
    event.preventDefault(); event.stopPropagation();
    if (!stairSource) { setMessage('Point A must be on a platform edge so the stringers can meet a defined header.'); return; }
    const pointer = worldPointFromClient(event.clientX, event.clientY);
    const platform = findHighestPlatformBelowPoint(design, stairSource.platformId, pointer)
      ?? (clickedPlatform.id !== stairSource.platformId ? clickedPlatform : null);
    if (!platform) { setMessage('This is the departure platform. Click a lower landing platform, or click open yard for grade.'); return; }
    const target = nearestPlatformEdgePoint(platform, pointer);
    try {
      onConnectStair(stairSource.platformId, stairSource.edgeId, stairSource.pointMm, target.pointMm, platform.id, target.edgeId);
      setStairSource(null); setHoverPoint(null); setMode('select');
      setMessage(`Landing detected: ${platform.name} at ${platform.elevationMm} mm. The stringers are square to the departure header and Point B is anchored to the landing edge.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The landing does not line up with a sound stair connection.'); }
  };

  const handleEdgePointerDown = (event: ReactPointerEvent<SVGLineElement>, platform: DeckPlatform, edgeIndex: number) => {
    if (mode === 'pan' || spacePan || event.button === 1) return;
    if (mode === 'insert') { insertCorner(event, platform, edgeIndex); return; }
    if (mode === 'stairs') { connectStairEdge(event, platform, edgeIndex); return; }
    beginDrag(event, platform, 'edge', edgeIndex);
  };

  const handleVertexPointerDown = (event: ReactPointerEvent<SVGCircleElement>, platform: DeckPlatform, vertexIndex: number) => {
    if (mode === 'remove') { removeCorner(event, platform, vertexIndex); return; }
    beginDrag(event, platform, 'vertex', vertexIndex);
  };

  const displayedBoundary = (platform: DeckPlatform) => preview?.platformId === platform.id ? preview.boundary : platform.boundary;
  const cancelDrawing = () => { setDraft([]); setDraftFuture([]); setHoverPoint(null); setStairSource(null); setStairHelpOpen(true); setDragRulers(null); setMode('select'); setMessage(''); };
  const beginDrawing = () => { setMode('draw'); setDraft([]); setDraftFuture([]); setHoverPoint(null); setDrawHelpOpen(true); setMessage('Click the first corner anywhere—even over an existing platform. Backspace or Undo removes an accidental corner.'); setTimeout(() => svgRef.current?.focus(), 0); };
  const beginInsert = () => { setMode('insert'); setStairSource(null); setMessage('Click anywhere on a platform edge to insert a new shape corner.'); };
  const beginRemove = () => { setMode('remove'); setStairSource(null); setMessage('Click a red corner to remove it. A platform must keep at least three corners.'); };
  const beginStairs = () => { fitView('detail'); setMode('stairs'); setStairSource(null); setStairHelpOpen(true); setMessage('Step 1: click the exact deck-edge point where the stair opening begins.'); };
  const beginPan = () => { setDraft([]); setDraftFuture([]); setHoverPoint(null); setStairSource(null); setMode('pan'); setMessage('Drag anywhere to pan. Press Space while using another tool for temporary pan.'); };
  const fitView = (nextView: ViewMode) => { setViewMode(nextView); setZoom(1); setPan([0, 0]); };
  const resetView = () => { setZoom(1); setPan([0, 0]); };
  const changeZoom = (factor: number) => setZoom((current) => clampZoom(current * factor));
  const handleWheelZoom = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    wheelDeltaRef.current += event.deltaY;
    const steps = Math.trunc(Math.abs(wheelDeltaRef.current) / 80);
    if (!steps) return;
    const direction = Math.sign(wheelDeltaRef.current);
    wheelDeltaRef.current -= direction * steps * 80;
    changeZoom(Math.pow(1.05, -direction * steps));
  };
  const undoDraftPoint = () => setDraft((current) => {
    const removed = current[current.length - 1];
    if (!removed) return current;
    setDraftFuture((future) => [removed, ...future]);
    setMessage(current.length <= 1 ? 'First corner removed. Click to start again.' : `Corner ${current.length} removed.`);
    return current.slice(0, -1);
  });
  const redoDraftPoint = () => setDraftFuture((future) => {
    const restored = future[0];
    if (!restored) return future;
    setDraft((current) => [...current, restored]);
    setMessage('Corner restored.');
    return future.slice(1);
  });
  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === ' ') { event.preventDefault(); setSpacePan(true); return; }
    if (mode === 'insert' || mode === 'remove' || mode === 'stairs') { if (event.key === 'Escape') { event.preventDefault(); cancelDrawing(); } return; }
    if (mode !== 'draw') return;
    if (event.key === 'Escape') { event.preventDefault(); cancelDrawing(); }
    if (event.key === 'Enter') { event.preventDefault(); finishDrawing(); }
    if (event.key === 'Backspace' || event.key === 'Delete' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey)) { event.preventDefault(); undoDraftPoint(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); redoDraftPoint(); }
  };
  const handleKeyUp = (event: React.KeyboardEvent<SVGSVGElement>) => { if (event.key === ' ') { event.preventDefault(); setSpacePan(false); } };
  const finishPointerInteraction = () => {
    if (panDrag) { setPanDrag(null); return; }
    if (stairDrag && stairPreview) {
      if (stairDrag.kind === 'move') {
        onMoveStair(stairDrag.stairId, stairPreview.startMm[0] - stairDrag.original.startMm[0], stairPreview.startMm[1] - stairDrag.original.startMm[1]);
        setMessage('Stair relocated along the platform edge.');
      } else if (stairDrag.kind === 'width-left' || stairDrag.kind === 'width-right') {
        onResizeStairSide(stairDrag.stairId, stairDrag.kind === 'width-left' ? 'left' : 'right', stairPreview.widthMm);
        setMessage(`Stair ${stairDrag.kind === 'width-left' ? 'left' : 'right'} edge set; clear width is ${stairPreview.widthMm} mm.`);
      } else {
        onSetStairConstruction(stairDrag.stairId, { directionDeg: stairPreview.directionDeg });
        setMessage(`Stair plan direction set to ${Math.round(stairPreview.directionDeg)}°.`);
      }
      setStairDrag(null); setStairPreview(null); return;
    }
    finishDrag();
  };

  return <div className="absolute inset-0 flex flex-col bg-[#edf2ef]" data-testid="deck-plan-editor">
    <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-3 py-2">
      <div className="flex rounded-lg bg-slate-100 p-1" role="toolbar" aria-label="Deck drawing tools">
        <ToolButton active={mode === 'select'} label="Edit shape" onClick={cancelDrawing} icon={<MousePointer2 size={15} />} />
        <ToolButton active={mode === 'pan'} label="Pan" onClick={beginPan} icon={<Hand size={15} />} />
        <ToolButton active={mode === 'draw'} label="Draw platform" onClick={beginDrawing} icon={<Pencil size={15} />} />
        <ToolButton active={mode === 'insert'} label="Add corner" onClick={beginInsert} icon={<Plus size={15} />} />
        <ToolButton active={mode === 'remove'} label="Remove corner" onClick={beginRemove} icon={<Minus size={15} />} />
        <ToolButton active={mode === 'stairs'} label="Add stairs" onClick={beginStairs} icon={<Footprints size={15} />} />
      </div>
      {mode === 'draw' && <div className="flex items-center gap-1">
        <button type="button" onClick={finishDrawing} className="flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white"><Check size={14} /> Finish</button>
        <button type="button" onClick={cancelDrawing} className="flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600"><X size={14} /> Cancel</button>
      </div>}
      {mode === 'stairs' && <div className="flex items-center gap-1">
        <button type="button" onClick={() => setStairHelpOpen((current) => !current)} aria-expanded={stairHelpOpen} className="flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800"><Footprints size={14} /> {stairHelpOpen ? 'Hide instructions' : 'Show instructions'}</button>
        <button type="button" onClick={cancelDrawing} className="flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600"><X size={14} /> Cancel stair</button>
      </div>}
      <div className="flex rounded-lg bg-slate-100 p-1" aria-label="Plan view">
        <ToolButton active={viewMode === 'detail'} label="Fit deck" onClick={() => fitView('detail')} icon={<Scan size={14} />} />
        <ToolButton active={viewMode === 'property'} label="Fit property" onClick={() => fitView('property')} icon={<Map size={14} />} />
      </div>
      <button type="button" aria-pressed={angleSnapEnabled} onClick={() => setAngleSnapEnabled((current) => !current)} className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${angleSnapEnabled ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-500'}`}><Magnet size={14} /> Angle snap {ANGLE_SNAP_DEG}°</button>
      <button type="button" aria-pressed={smartGuidesEnabled} onClick={() => setSmartGuidesEnabled((current) => !current)} className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${smartGuidesEnabled ? 'border-fuchsia-600 bg-fuchsia-50 text-fuchsia-800' : 'border-slate-300 bg-white text-slate-500'}`}><Ruler size={14} /> Smart rulers</button>
      <div className="ml-auto flex items-center gap-1">
        <div className="mr-1 flex items-center overflow-hidden rounded-md border border-slate-300 bg-white" aria-label="Plan zoom controls">
          <button type="button" onClick={() => changeZoom(1 / 1.15)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" className="grid h-9 w-9 place-items-center text-slate-600 disabled:opacity-30"><ZoomOut size={15} /></button>
          <button type="button" onClick={resetView} aria-label="Reset zoom and pan to fit" className="min-w-14 border-x border-slate-200 px-2 text-[10px] font-bold tabular-nums text-slate-600">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => changeZoom(1.15)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" className="grid h-9 w-9 place-items-center text-slate-600 disabled:opacity-30"><ZoomIn size={15} /></button>
        </div>
        <button type="button" onClick={mode === 'draw' ? undoDraftPoint : onUndo} disabled={mode === 'draw' ? draft.length === 0 : !canUndo} aria-label={mode === 'draw' ? 'Undo last corner' : 'Undo design change'} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 text-slate-600 disabled:opacity-30"><Undo2 size={15} /></button>
        <button type="button" onClick={mode === 'draw' ? redoDraftPoint : onRedo} disabled={mode === 'draw' ? draftFuture.length === 0 : !canRedo} aria-label={mode === 'draw' ? 'Redo last corner' : 'Redo design change'} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 text-slate-600 disabled:opacity-30"><Redo2 size={15} /></button>
        <button type="button" onClick={beginDrawing} aria-label="Restart platform drawing" className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 text-slate-600"><RotateCcw size={15} /></button>
      </div>
    </div>

    <div className="relative min-h-0 flex-1 overflow-hidden">
      <svg ref={svgRef} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} tabIndex={0} className={`h-full w-full touch-none select-none outline-none ${panDrag ? 'cursor-grabbing' : mode === 'pan' || spacePan ? 'cursor-grab' : ''}`} role="application" aria-label="Deck architectural plan editor" onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} onBlur={() => setSpacePan(false)} onWheel={handleWheelZoom} onPointerDown={handleCanvasPointerDown} onPointerMove={handlePointerMove} onPointerLeave={() => { if (!drag && !stairDrag && !panDrag) setHoverPoint(null); }} onPointerUp={finishPointerInteraction} onPointerCancel={finishPointerInteraction}>
        <defs>
          <pattern id="architect-grid" width={Math.max(8, transform.scale * 500)} height={Math.max(8, transform.scale * 500)} patternUnits="userSpaceOnUse"><path d={`M ${Math.max(8, transform.scale * 500)} 0 L 0 0 0 ${Math.max(8, transform.scale * 500)}`} fill="none" stroke="#ccd7d0" strokeWidth=".7" /></pattern>
          <filter id="platform-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#274335" floodOpacity=".16" /></filter>
        </defs>
        <rect data-background="true" width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#architect-grid)" />
        <SiteContext site={site} geometry={propertyGeometry} setbackGuides={setbackGuides} transform={transform} viewMode={viewMode} />
        <g data-testid="existing-design-layers" pointerEvents={existingLayersPointerEvents(mode)}>
          {design.platforms.map((platform) => <PlatformShape key={platform.id} platform={platform} boundary={displayedBoundary(platform)} selected={selectedPlatform?.id === platform.id} detectedLanding={detectedLanding?.id === platform.id} transform={transform} interactionMode={mode} stairSourceEdgeId={stairSource?.platformId === platform.id ? stairSource.edgeId : null} onSelect={(event) => connectStairPlatform(event, platform)} onRotate={(event) => beginPlatformRotate(event, platform)} onVertex={(event, index) => handleVertexPointerDown(event, platform, index)} onEdge={(event, index) => handleEdgePointerDown(event, platform, index)} />)}
          {design.stairs.map((stair) => {
            const visibleStair = stairPreview?.stairId === stair.id ? { ...stair, widthMm: stairPreview.widthMm, directionDeg: stairPreview.directionDeg, startMm: stairPreview.startMm, endMm: stairPreview.endMm } : stair;
            const sourcePlatformId = stair.from.kind === 'platform' ? stair.from.platformId : null;
            const sourcePlatform = sourcePlatformId ? design.platforms.find((platform) => platform.id === sourcePlatformId) : null;
            const sourceEdgeIndex = sourcePlatform?.edges.findIndex((edge) => edge.id === stair.fromEdgeId) ?? -1;
            const sourceStart = sourcePlatform && sourceEdgeIndex >= 0 ? sourcePlatform.boundary.vertices[sourceEdgeIndex] : null;
            const sourceEnd = sourcePlatform && sourceEdgeIndex >= 0 ? sourcePlatform.boundary.vertices[(sourceEdgeIndex + 1) % sourcePlatform.boundary.vertices.length] : null;
            const departureEdgeAngleDeg = sourceStart && sourceEnd ? Math.atan2(sourceEnd.yMm - sourceStart.yMm, sourceEnd.xMm - sourceStart.xMm) * 180 / Math.PI : null;
            return <StairShape key={stair.id} stair={visibleStair} departureEdgeAngleDeg={departureEdgeAngleDeg} transform={transform} selected={design.selectedObjectId === stair.id} onSelect={() => onSelectObject(stair.id)} onBeginMove={(event) => beginStairDrag(event, stair, 'move')} onBeginWidthLeft={(event) => beginStairDrag(event, stair, 'width-left')} onBeginWidthRight={(event) => beginStairDrag(event, stair, 'width-right')} onBeginDirection={(event) => beginStairDrag(event, stair, 'direction')} />;
          })}
        </g>
        {dragRulers && <SmartRulers result={dragRulers} transform={transform} />}
        {draft.length > 0 && <DraftBoundary points={draft} hoverPoint={hoverPoint} transform={transform} onClose={finishDrawing} />}
        {mode === 'stairs' && stairSource && hoverPoint && <StairDraft startMm={stairSource.pointMm} endMm={hoverPoint} riseMm={stairPreviewRiseMm} directionDeg={stairPreviewDirectionDeg} targetLabel={detectedLanding ? `${detectedLanding.name} · EL. ${detectedLanding.elevationMm} mm` : `LOCAL GRADE · EL. ${hoverGrade?.elevationMm ?? site.terrain.datum.elevationMm} mm${hoverGrade?.method === 'interpolated' ? ' · interpolated' : ''}`} transform={transform} />}
      </svg>
      {mode === 'stairs' && <div className="pointer-events-none absolute inset-0" aria-label="Stair edge targets">{design.platforms.flatMap((platform) => platform.boundary.vertices.map((start, index, vertices) => {
        const end = vertices[(index + 1) % vertices.length];
        const x = transform.x((start.xMm + end.xMm) / 2);
        const y = transform.y((start.yMm + end.yMm) / 2) - 22;
        const source = stairSource?.platformId === platform.id && stairSource.edgeId === platform.edges[index]?.id;
        return <button key={`${platform.id}-stair-target-${index}`} type="button" aria-label={`Start or connect stairs at ${platform.name} edge ${index + 1}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); connectStairMarker(platform, index); }} style={{ left: `${x / VIEW_WIDTH * 100}%`, top: `${y / VIEW_HEIGHT * 100}%` }} className={`pointer-events-auto absolute z-20 grid h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white text-[8px] font-extrabold text-white shadow-sm ${source ? 'bg-amber-500' : 'bg-emerald-700'}`}>ST</button>;
      }))}</div>}
      {propertyGeometry && (propertyGeometry.alignmentStatus === 'provisional' ? <button type="button" onClick={onOpenProperty} className="absolute left-4 top-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[.08em] text-amber-900 shadow-sm">Property visible · alignment provisional<br /><span className="text-[9px] underline">Choose the correct house edge →</span></button> : <div className="absolute left-4 top-4 rounded-md border border-emerald-300 bg-white/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[.08em] text-emerald-800 shadow-sm">Property visible · {propertyGeometry.alignmentStatus === 'field-measured' ? 'field-measured wall' : 'homeowner-selected house edge'}</div>)}
      {propertyGeometry && <div className="absolute right-4 top-4 flex overflow-hidden rounded-lg border border-slate-300 bg-white/95 shadow-lg"><button type="button" onClick={onRotateProperty} className="flex min-h-10 items-center gap-1.5 border-r border-slate-200 px-3 text-[10px] font-bold text-slate-700" title="Use when the municipal house and yard appear on the opposite side"><RotateCw size={14} /> Rotate site 180°</button><button type="button" onClick={onMirrorProperty} className="flex min-h-10 items-center gap-1.5 px-3 text-[10px] font-bold text-slate-700" title="Reverse the start and end of the selected house wall"><FlipHorizontal2 size={14} /> Reverse wall direction</button></div>}
      {mode === 'draw' && drawHelpOpen && draft.length === 0 && <div role="status" className="absolute left-1/2 top-4 flex w-[min(390px,calc(100%-32px))] -translate-x-1/2 items-start gap-2 rounded-lg border border-emerald-300 bg-white/95 px-4 py-2 shadow-lg"><div className="flex-1 text-center"><strong className="block text-[10px] uppercase tracking-[.12em] text-emerald-800">Drawing a new platform layer</strong><span className="mt-0.5 block text-[10px] leading-4 text-slate-600">Place corners anywhere, including over an existing platform. Elevation is set separately.</span></div><button type="button" onClick={() => setDrawHelpOpen(false)} aria-label="Hide drawing instructions" className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-300 text-slate-500"><X size={13} /></button></div>}
      {mode === 'stairs' && stairHelpOpen && <section aria-label="Add stairs steps" className="pointer-events-none absolute left-1/2 top-4 w-[min(430px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-emerald-800/20 bg-white/95 p-4 shadow-xl backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-[.13em] text-emerald-700">{stairSource ? 'Point B · landing' : 'Point A · departure'}</span><strong className="mt-1 block text-sm text-slate-900">{stairSource ? 'Click where the stairs should end' : 'Click where the stairs should begin'}</strong></div><button type="button" onClick={() => setStairHelpOpen(false)} aria-label="Hide stair instructions" className="pointer-events-auto grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-300 text-slate-500"><X size={14} /></button></div>
        {!stairSource ? <p className="mt-2 text-xs leading-5 text-slate-600">Click the exact departure point on a platform edge. This becomes the stair opening in the deck and guard.</p> : <div className="mt-3 grid gap-2">
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700"><strong>Point A · {stairSourcePlatform?.name}, edge {stairSourceEdgeIndex + 1}</strong><span className="ml-2 text-slate-500">elevation {stairSourcePlatform?.elevationMm} mm</span></div>
          <p className="text-xs leading-5 text-slate-600">Click the yard for grade, or click inside a lower platform to use it as a landing. The stair axis stays square to the departure edge so its stringers meet a real header; the geometry engine detects the nearest lower level and anchors Point B.</p>
          {detectedLanding && <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-950">Detected below cursor: {detectedLanding.name} · elevation {detectedLanding.elevationMm} mm · rise {stairPreviewRiseMm} mm</p>}
          {stairRiseToGradeMm >= 125 && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-950">Elevation change: {stairRiseToGradeMm} mm. You do not need to place Point B at a code-perfect distance.</p>}
        </div>}
      </section>}
      {!design.platforms.length && mode === 'select' && <button type="button" onClick={beginDrawing} className="absolute left-1/2 top-1/2 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-emerald-800/20 bg-white p-5 text-left shadow-xl">
        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-700">Start with the house</span>
        <strong className="mt-1 block text-base text-slate-900">Draw your first deck platform</strong>
        <span className="mt-1 block text-xs leading-5 text-slate-600">Each click adds a shape corner. Click the first point or press Enter to close the platform.</span>
      </button>}
      <section className="absolute bottom-4 right-4 w-[min(330px,calc(100%-32px))] overflow-hidden rounded-xl border border-slate-300 bg-white/95 shadow-xl backdrop-blur-sm" aria-label="Running project estimate">
        <button type="button" onClick={() => setEstimateOpen((current) => !current)} aria-expanded={estimateOpen} className="flex w-full items-center gap-3 p-3 text-left">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800"><CircleDollarSign size={18} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-[.13em] text-emerald-700">Running material allowance</span><strong className="mt-0.5 block text-sm tabular-nums text-slate-950">{moneyRange(estimate.materialLowCad, estimate.materialHighCad)}</strong><span className="block text-[10px] text-slate-500">Projected installed {moneyRange(estimate.installedLowCad, estimate.installedHighCad)}</span></span>
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${estimateOpen ? 'rotate-180' : ''}`} />
        </button>
        {estimateOpen && <div className="border-t border-slate-200 px-3 pb-3 pt-2">
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-4 text-amber-950"><strong className="block">Regional model · not live supplier pricing</strong>This version does not query a lumberyard cart. It applies the listed unit-rate bands to your design geometry.</div>
          <dl className="grid gap-1.5">{estimate.lines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_auto] gap-x-3 text-[10px]"><dt className="font-semibold text-slate-700">{line.label}</dt><dd className="font-bold tabular-nums text-slate-900">{moneyRange(line.lowCad, line.highCad)}</dd><dd className="col-span-2 truncate text-[9px] text-slate-400" title={line.basis}>{line.basis}</dd></div>)}</dl>
          <p className="mt-2 border-t border-slate-200 pt-2 text-[9px] leading-4 text-slate-500"><strong>Installed range:</strong> {estimate.installedBasis}</p>
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[9px]">{estimate.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-800 underline">{source.label}</a>)}</div>
          <p className="mt-2 text-[9px] leading-4 text-slate-500">Concept allowance in CAD using July 2026 regional ranges. Before tax; excludes demolition, difficult access, utility relocation, and unknown soil. A SKU-level supplier takeoff should replace this after framing and product selection.</p>
        </div>}
      </section>
      {message && <div aria-live="polite" className="absolute bottom-4 left-1/2 max-w-lg -translate-x-1/2 rounded-lg border border-slate-300 bg-white/95 px-4 py-2 text-center text-xs text-slate-700 shadow-lg">{message}</div>}
      <div className="absolute bottom-4 left-4 rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-500"><strong className="text-slate-700">PROJECT DATUM · EL. {site.terrain.datum.elevationMm} mm</strong> · {site.terrain.gradePoints.length} grade point{site.terrain.gradePoints.length === 1 ? '' : 's'} · 100 mm grid · {angleSnapEnabled ? `${ANGLE_SNAP_DEG}° angle snap` : 'free angles'} · {smartGuidesEnabled ? 'smart rulers on' : 'smart rulers off'} · Pan tool, Space-drag, or middle-drag</div>
    </div>
  </div>;
}

interface Transform { scale: number; x: (value: number) => number; y: (value: number) => number; fromScreenX: (value: number) => number; fromScreenY: (value: number) => number }

function createTransform(design: DeckDesign, site: SiteModel, geometry: LocalPropertyGeometry | null, viewMode: ViewMode, zoom: number, pan: PointMm): Transform {
  const selectedBuilding = geometry?.buildings.find((building) => building.id === geometry.selectedBuildingId);
  const contextPoints = viewMode === 'property' ? geometry?.parcel || [] : selectedBuilding?.polygon || [];
  const fallbackPoints: PointMm[] = [[0, 0], [site.designWall.lengthMm, 0], [site.designWall.lengthMm, -site.houseDepthMm], [0, -site.houseDepthMm]];
  const visibleContext = contextPoints.length ? contextPoints : fallbackPoints;
  const xValues = [...visibleContext.map((point) => point[0]), ...design.platforms.flatMap((platform) => platform.boundary.vertices.map((vertex) => vertex.xMm)), ...site.terrain.gradePoints.map((point) => point.xMm)];
  const yValues = [...visibleContext.map((point) => point[1]), ...design.platforms.flatMap((platform) => platform.boundary.vertices.map((vertex) => vertex.yMm)), ...site.terrain.gradePoints.map((point) => point.yMm)];
  const minX = Math.min(...xValues); const maxX = Math.max(...xValues); const minY = Math.min(...yValues); const maxY = Math.max(...yValues);
  const padding = viewMode === 'property' ? 70 : 95;
  const fitScale = Math.min((VIEW_WIDTH - padding * 2) / Math.max(1000, maxX - minX), (VIEW_HEIGHT - padding * 2) / Math.max(1000, maxY - minY));
  const scale = fitScale * zoom;
  const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
  const offsetX = VIEW_WIDTH / 2 - centerX * scale + pan[0];
  const offsetY = VIEW_HEIGHT / 2 - centerY * scale + pan[1];
  return { scale, x: (value) => offsetX + value * scale, y: (value) => offsetY + value * scale, fromScreenX: (value) => (value - offsetX) / scale, fromScreenY: (value) => (value - offsetY) / scale };
}

function SiteContext({ site, geometry, setbackGuides, transform, viewMode }: { site: SiteModel; geometry: LocalPropertyGeometry | null; setbackGuides: ReferenceSetbackGuide[]; transform: Transform; viewMode: ViewMode }) {
  const selectedBuilding = geometry?.buildings.find((building) => building.id === geometry.selectedBuildingId);
  if (!geometry || !selectedBuilding) return <FallbackHouseReference site={site} transform={transform} />;
  return <g pointerEvents="none">
    <polygon points={svgPoints(geometry.parcel, transform)} fill={viewMode === 'property' ? 'rgba(220,241,228,.55)' : 'none'} stroke="#23805e" strokeWidth={viewMode === 'property' ? 3 : 2} strokeDasharray="9 5" />
    {setbackGuides.length > 0 && <g aria-label="Recorded zoning setback guides">{setbackGuides.map((guide) => {
      const propertyMid = midpoint(guide.propertyStartMm, guide.propertyEndMm);
      const guideMid = midpoint(guide.guideStartMm, guide.guideEndMm);
      return <g key={guide.id}>
        <polygon points={svgPoints(guide.bandPolygon, transform)} fill="rgba(194,65,12,.075)" stroke="none" />
        <line x1={transform.x(guide.guideStartMm[0])} y1={transform.y(guide.guideStartMm[1])} x2={transform.x(guide.guideEndMm[0])} y2={transform.y(guide.guideEndMm[1])} stroke="#c2410c" strokeWidth="2" strokeDasharray="7 5" />
        <line x1={transform.x(propertyMid[0])} y1={transform.y(propertyMid[1])} x2={transform.x(guideMid[0])} y2={transform.y(guideMid[1])} stroke="#c2410c" strokeWidth="1" strokeDasharray="3 3" />
        <text x={transform.x(guideMid[0])} y={transform.y(guideMid[1]) - 7} textAnchor="middle" fontSize="8" fontWeight="900" fill="#9a3412" paintOrder="stroke" stroke="white" strokeWidth="3">{guide.yard.toUpperCase().replace(/-/g, ' ')} SETBACK · {formatM(guide.requiredMm)}</text>
      </g>;
    })}</g>}
    {geometry.buildings.filter((building) => building.id !== selectedBuilding.id).map((building) => <polygon key={building.id} points={svgPoints(building.polygon, transform)} fill={viewMode === 'property' ? '#e1e7e3' : 'none'} stroke="#7b8b82" strokeWidth="1.5" />)}
    <polygon points={svgPoints(selectedBuilding.polygon, transform)} fill="#d3ddd7" stroke="#394b42" strokeWidth="2.5" />
    <line x1={transform.x(0)} y1={transform.y(0)} x2={transform.x(geometry.anchorLengthMm)} y2={transform.y(0)} stroke={geometry.alignmentStatus === 'field-measured' ? '#114c37' : '#d65d2e'} strokeWidth="6" strokeDasharray={geometry.alignmentStatus === 'provisional' ? '10 5' : undefined} />
    <text x={transform.x(0) + 12} y={transform.y(0) - 16} fontSize={viewMode === 'property' ? 9 : 11} fontWeight="800" fill="#38483f">{geometry.alignmentStatus === 'provisional' ? 'PROVISIONAL LONGEST HOUSE EDGE' : site.designWall.selectionStatus === 'field-measured' ? 'FIELD-MEASURED HOUSE WALL' : 'SELECTED MUNICIPAL HOUSE EDGE'} · {formatM(geometry.anchorLengthMm)}</text>
    <text x={transform.x(0) + 12} y={transform.y(0) - 3} fontSize="8" fontWeight="600" fill="#62726a">{geometry.alignmentStatus === 'provisional' ? 'Choose the yard-facing house edge in Property before relying on deck position.' : site.designWall.label}</text>
    <text x={transform.x(geometry.anchorLengthMm / 2)} y={transform.y(geometry.exteriorSideSign * 900)} textAnchor="middle" fontSize="9" fontWeight="800" fill="#b64b25">HOUSE EXTERIOR / DECK SIDE</text>
    {site.designWall.openings.map((opening) => <g key={opening.id}><rect x={transform.x(opening.offsetMm)} y={transform.y(0) - 42} width={Math.max(12, opening.widthMm * transform.scale)} height="42" fill={opening.kind === 'door' ? '#8db6b0' : '#b6ced0'} stroke="#315e57" strokeWidth="2" /><text x={transform.x(opening.offsetMm + opening.widthMm / 2)} y={transform.y(0) - 16} textAnchor="middle" fontSize="8" fontWeight="700" fill="#183e38">{openingPlanLabel(opening)}</text></g>)}
    <text x={transform.x(geometry.parcel[0]?.[0] || 0)} y={transform.y(geometry.parcel[0]?.[1] || 0) - 10} fontSize="9" fontWeight="800" fill="#187456">MUNICIPAL PROPERTY LINE · REFERENCE</text>
    {site.terrain.gradePoints.map((point) => <g key={point.id}><circle cx={transform.x(point.xMm)} cy={transform.y(point.yMm)} r="6" fill="#fff" stroke="#6d28d9" strokeWidth="2.5" /><path d={`M${transform.x(point.xMm) - 9} ${transform.y(point.yMm)}h18M${transform.x(point.xMm)} ${transform.y(point.yMm) - 9}v18`} stroke="#6d28d9" strokeWidth="1" /><text x={transform.x(point.xMm) + 10} y={transform.y(point.yMm) - 9} fontSize="8" fontWeight="800" fill="#5b21b6">{point.id} · EL. {point.elevationMm}</text></g>)}
  </g>;
}

export function openingPlanLabel(opening: SiteModel['designWall']['openings'][number]): string {
  const provenance = opening.sourceAiObservationRefs?.length ? 'AI / PHOTO OBSERVED' : opening.evidenceStatus === 'photo-observed' ? 'PHOTO OBSERVED' : opening.evidenceStatus === 'professional-verified' ? 'PROFESSIONAL VERIFIED' : 'FIELD MEASURED';
  return `${opening.kind.toUpperCase()} ${opening.id} · ${provenance}`;
}

function FallbackHouseReference({ site, transform }: { site: SiteModel; transform: Transform }) {
  const x = transform.x(0); const y = transform.y(-site.houseDepthMm); const width = site.designWall.lengthMm * transform.scale; const height = site.houseDepthMm * transform.scale;
  return <g pointerEvents="none"><rect x={x} y={y} width={width} height={height} fill="#d5ddd8" stroke="#394b42" strokeWidth="2" strokeDasharray="8 5" /><line x1={x} y1={transform.y(0)} x2={x + width} y2={transform.y(0)} stroke="#d65d2e" strokeWidth="5" /><text x={x + 14} y={y + 24} fontSize="11" fontWeight="700" fill="#38483f">UNVERIFIED HOUSE ENVELOPE · NO WALL SELECTED</text><text x={x + 14} y={y + 42} fontSize="9" fontWeight="600" fill="#62726a">Return to Property and select the yard-facing roofline edge.</text></g>;
}

function PlatformShape({ platform, boundary, selected, detectedLanding, transform, interactionMode, stairSourceEdgeId, onSelect, onRotate, onVertex, onEdge }: { platform: DeckPlatform; boundary: ClosedBoundary; selected: boolean; detectedLanding: boolean; transform: Transform; interactionMode: EditorMode; stairSourceEdgeId: string | null; onSelect: (event: ReactPointerEvent<SVGPolygonElement>) => void; onRotate: (event: ReactPointerEvent<SVGCircleElement>) => void; onVertex: (event: ReactPointerEvent<SVGCircleElement>, index: number) => void; onEdge: (event: ReactPointerEvent<SVGLineElement>, index: number) => void }) {
  const points = boundary.vertices.map((vertex) => `${transform.x(vertex.xMm)},${transform.y(vertex.yMm)}`).join(' ');
  const centerX = average(boundary.vertices.map((vertex) => transform.x(vertex.xMm)));
  const centerY = average(boundary.vertices.map((vertex) => transform.y(vertex.yMm)));
  const topY = Math.min(...boundary.vertices.map((vertex) => transform.y(vertex.yMm)));
  return <g>
    <polygon points={points} fill={selected ? '#d8975d' : '#deb17f'} fillOpacity=".92" stroke={detectedLanding ? '#059669' : selected ? '#0f6b4d' : '#536b5f'} strokeWidth={detectedLanding ? 7 : selected ? 4 : 2} strokeDasharray={detectedLanding ? '12 6' : undefined} filter="url(#platform-shadow)" onPointerDown={onSelect} aria-label={`${platform.name}, elevation ${platform.elevationMm} millimetres`} />
    <text x={centerX} y={centerY} textAnchor="middle" fontSize="13" fontWeight="800" fill="#174f3a" pointerEvents="none">{platform.purpose === 'landing' ? 'LANDING · ' : ''}{platform.name.toUpperCase()}</text>
    <text x={centerX} y={centerY + 18} textAnchor="middle" fontSize="10" fontWeight="700" fill="#315e57" pointerEvents="none">EL. {platform.elevationMm} mm</text>
    {selected && interactionMode === 'select' && <g><line x1={centerX} y1={topY} x2={centerX} y2={topY - 38} stroke="#087553" strokeWidth="2" strokeDasharray="5 4" pointerEvents="none" /><circle cx={centerX} cy={topY - 48} r="13" fill="white" stroke="#087553" strokeWidth="3" onPointerDown={onRotate} role="button" aria-label={`Drag to rotate ${platform.name}`} className="cursor-grab" /><text x={centerX} y={topY - 44} textAnchor="middle" fontSize="12" fontWeight="900" fill="#087553" pointerEvents="none">↻</text></g>}
    {boundary.vertices.map((start, index) => {
      const end = boundary.vertices[(index + 1) % boundary.vertices.length];
      const x1 = transform.x(start.xMm); const y1 = transform.y(start.yMm); const x2 = transform.x(end.xMm); const y2 = transform.y(end.yMm);
      const source = stairSourceEdgeId === platform.edges[index]?.id;
      return <g key={`${platform.id}-edge-${index}`}>
        {source && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#087553" strokeWidth="10" strokeLinecap="round" pointerEvents="none" />}
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="22" onPointerDown={(event) => onEdge(event, index)} className={interactionMode === 'insert' || interactionMode === 'stairs' ? 'cursor-crosshair' : 'cursor-grab'} aria-label={`${platform.name} edge ${index + 1}`} />
        <rect x={(x1 + x2) / 2 - 39} y={(y1 + y2) / 2 - 9} width="78" height="18" rx="4" fill="white" stroke="#aebdb5" pointerEvents="none" />
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#315e57" pointerEvents="none">{formatM(Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm))} · {formatAngle(lineAngleDeg([start.xMm, start.yMm], [end.xMm, end.yMm]))}</text>
        {interactionMode === 'insert' && <g pointerEvents="none"><circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2 - 22} r="9" fill="#087553" /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 18.5} textAnchor="middle" fontSize="12" fontWeight="800" fill="white">+</text></g>}
      </g>;
    })}
    {(selected || interactionMode === 'remove') && boundary.vertices.map((vertex, index) => {
      const x = transform.x(vertex.xMm); const y = transform.y(vertex.yMm);
      const towardCenterX = centerX - x; const towardCenterY = centerY - y;
      const distanceToCenter = Math.max(1, Math.hypot(towardCenterX, towardCenterY));
      return <g key={vertex.id}>
        <circle cx={x} cy={y} r={interactionMode === 'remove' ? 11 : 9} fill={interactionMode === 'remove' ? '#fff1ed' : 'white'} stroke={interactionMode === 'remove' ? '#c2412d' : '#087553'} strokeWidth="3" onPointerDown={(event) => onVertex(event, index)} aria-label={interactionMode === 'remove' ? `Remove corner ${index + 1}` : `Move corner ${index + 1}, ${formatAngle(interiorAngleDeg(boundary.vertices, index))}`} className={interactionMode === 'remove' ? 'cursor-pointer' : undefined} />
        {interactionMode === 'remove' && <text x={x} y={y + 4} textAnchor="middle" fontSize="13" fontWeight="900" fill="#c2412d" pointerEvents="none">−</text>}
        <text x={x + towardCenterX / distanceToCenter * 24} y={y + towardCenterY / distanceToCenter * 24 + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#174f3a" pointerEvents="none">{formatAngle(interiorAngleDeg(boundary.vertices, index))}</text>
      </g>;
    })}
  </g>;
}

function SmartRulers({ result, transform }: { result: SmartGuideResult; transform: Transform }) {
  const reference = result.nearest;
  if (!reference) return null;
  const movingX = transform.x(result.point[0]); const movingY = transform.y(result.point[1]);
  const referenceX = transform.x(reference.point[0]); const referenceY = transform.y(reference.point[1]);
  const deltaX = Math.abs(result.point[0] - reference.point[0]);
  const deltaY = Math.abs(result.point[1] - reference.point[1]);
  const direct = distance(result.point, reference.point);
  const horizontalY = movingY - 22;
  const verticalX = referenceX + 22;
  return <g pointerEvents="none" aria-label={`Smart rulers from moving corner to ${reference.label}`}>
    {result.guides.map((guide) => guide.axis === 'x'
      ? <g key={`x-${guide.reference.id}`}><line x1={transform.x(guide.reference.point[0])} y1="0" x2={transform.x(guide.reference.point[0])} y2={VIEW_HEIGHT} stroke="#db2777" strokeWidth="1.5" strokeDasharray="7 5" /><GuideTag x={transform.x(guide.reference.point[0]) + 8} y={18} text={`X · ${guide.reference.label}`} align="start" /></g>
      : <g key={`y-${guide.reference.id}`}><line x1="0" y1={transform.y(guide.reference.point[1])} x2={VIEW_WIDTH} y2={transform.y(guide.reference.point[1])} stroke="#db2777" strokeWidth="1.5" strokeDasharray="7 5" /><GuideTag x={8} y={transform.y(guide.reference.point[1]) - 10} text={`Y · ${guide.reference.label}`} align="start" /></g>)}
    <line x1={referenceX} y1={referenceY} x2={movingX} y2={movingY} stroke="#c026d3" strokeWidth="1.5" strokeDasharray="3 4" />
    {deltaX > 1 && <g><line x1={referenceX} y1={referenceY} x2={referenceX} y2={horizontalY} stroke="#a21caf" strokeWidth="1" /><line x1={movingX} y1={movingY} x2={movingX} y2={horizontalY} stroke="#a21caf" strokeWidth="1" /><line x1={referenceX} y1={horizontalY} x2={movingX} y2={horizontalY} stroke="#a21caf" strokeWidth="2" /><DimensionTick x={referenceX} y={horizontalY} vertical /><DimensionTick x={movingX} y={horizontalY} vertical /><GuideTag x={(referenceX + movingX) / 2} y={horizontalY - 8} text={`ΔX ${formatM(deltaX)}`} /></g>}
    {deltaY > 1 && <g><line x1={referenceX} y1={referenceY} x2={verticalX} y2={referenceY} stroke="#a21caf" strokeWidth="1" /><line x1={movingX} y1={movingY} x2={verticalX} y2={movingY} stroke="#a21caf" strokeWidth="1" /><line x1={verticalX} y1={referenceY} x2={verticalX} y2={movingY} stroke="#a21caf" strokeWidth="2" /><DimensionTick x={verticalX} y={referenceY} /><DimensionTick x={verticalX} y={movingY} /><GuideTag x={verticalX + 9} y={(referenceY + movingY) / 2 + 4} text={`ΔY ${formatM(deltaY)}`} align="start" /></g>}
    <circle cx={referenceX} cy={referenceY} r="6" fill="white" stroke="#c026d3" strokeWidth="2" />
    <circle cx={movingX} cy={movingY} r="7" fill="#fdf4ff" stroke="#c026d3" strokeWidth="2.5" />
    <GuideTag x={(referenceX + movingX) / 2} y={(referenceY + movingY) / 2 + 16} text={`${reference.label} · ${formatM(direct)} direct`} />
  </g>;
}

function DimensionTick({ x, y, vertical = false }: { x: number; y: number; vertical?: boolean }) {
  return vertical ? <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke="#a21caf" strokeWidth="2" /> : <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke="#a21caf" strokeWidth="2" />;
}

function GuideTag({ x, y, text, align = 'middle' }: { x: number; y: number; text: string; align?: 'start' | 'middle' }) {
  const width = Math.max(66, Math.min(190, text.length * 5.4 + 16));
  const rawLeft = align === 'start' ? x : x - width / 2;
  const left = Math.max(4, Math.min(VIEW_WIDTH - width - 4, rawLeft));
  const top = Math.max(4, Math.min(VIEW_HEIGHT - 22, y - 13));
  return <g transform={`translate(${left} ${top})`}><rect width={width} height="18" rx="4" fill="white" stroke="#d946ef" /><text x={align === 'start' ? 8 : width / 2} y="12" textAnchor={align} fontSize="8" fontWeight="800" fill="#86198f">{text}</text></g>;
}

function StairShape({ stair, departureEdgeAngleDeg, transform, selected, onSelect, onBeginMove, onBeginWidthLeft, onBeginWidthRight, onBeginDirection }: { stair: DeckDesign['stairs'][number]; departureEdgeAngleDeg: number | null; transform: Transform; selected: boolean; onSelect: () => void; onBeginMove: (event: ReactPointerEvent<SVGElement>) => void; onBeginWidthLeft: (event: ReactPointerEvent<SVGElement>) => void; onBeginWidthRight: (event: ReactPointerEvent<SVGElement>) => void; onBeginDirection: (event: ReactPointerEvent<SVGElement>) => void }) {
  const x = transform.x(stair.startMm[0]); const y = transform.y(stair.startMm[1]); const run = stair.totalRunMm * transform.scale; const width = stair.widthMm * transform.scale;
  const destination = stair.to.kind === 'terrain' ? 'YARD' : 'LOWER PLATFORM';
  const stringerCount = stair.stringerCount ?? Math.max(2, Math.ceil(stair.widthMm / 450) + 1);
  const handrailSides = stair.handrailSides ?? (stair.riserCount >= 3 ? 'both' : 'none');
  const treadCount = Math.max(1, stair.riserCount - 1);
  const landing = stair.to.kind === 'terrain' ? stair.landingDepthMm * transform.scale : 0;
  const targetDistance = distance(stair.startMm, stair.endMm) * transform.scale;
  const landingExtension = stair.to.kind === 'platform' ? Math.max(0, targetDistance - run) : 0;
  const connectionNodeRadius = Math.max(6, Math.min(11, Math.min(run, targetDistance || run) / 4));
  const radians = stair.directionDeg * Math.PI / 180;
  const headerRelativeRadians = departureEdgeAngleDeg === null ? Math.PI / 2 : (departureEdgeAngleDeg - stair.directionDeg) * Math.PI / 180;
  const headerTangent = Math.tan(headerRelativeRadians);
  const headerX = (localY: number) => Math.abs(headerTangent) < .05 ? 0 : localY / headerTangent;
  const headerTopX = headerX(-width / 2);
  const headerBottomX = headerX(width / 2);
  const labelOffset = width / 2 + 72;
  const labelX = x + Math.cos(radians) * run / 2 + -Math.sin(radians) * labelOffset;
  const labelY = y + Math.sin(radians) * run / 2 + Math.cos(radians) * labelOffset;
  return <g transform={`translate(${x} ${y})`} role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onSelect(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }} aria-label={`${stair.name}, stairs to ${destination.toLowerCase()}, ${stair.riserCount} risers at ${stair.riserHeightMm} millimetres`} className="cursor-pointer">
    <g transform={`rotate(${stair.directionDeg})`}>
      {landing > 0 && <rect x={run} y={-width / 2} width={landing} height={width} fill="rgba(255,255,255,.35)" stroke="#9b6a3a" strokeWidth="1.5" strokeDasharray="7 4" />}
      {landingExtension > 0 && <g><rect x={run} y={-width / 2} width={landingExtension} height={width} fill="#ead4b8" stroke="#9b6a3a" strokeWidth="2" strokeDasharray="7 4" /><text x={run + landingExtension / 2} y="3" textAnchor="middle" fontSize="7" fontWeight="800" fill="#6f3d15">LANDING EXT.</text></g>}
      <polygon points={`${headerTopX},${-width / 2} ${run},${-width / 2} ${run},${width / 2} ${headerBottomX},${width / 2}`} fill={selected ? '#fff0d4' : '#f7eee3'} stroke={selected ? '#c26716' : '#6f4d30'} strokeWidth={selected ? 4 : 2.5} />
      <line x1={headerTopX} y1={-width / 2 - 8} x2={headerBottomX} y2={width / 2 + 8} stroke="#d65d2e" strokeWidth="5" />
      <rect x="0" y={-Math.max(18, width / 2)} width={Math.max(28, run)} height={Math.max(36, width)} fill="transparent" stroke="transparent" strokeWidth="18" />
      {Array.from({ length: treadCount + 1 }, (_, index) => <line key={`tread-${index}`} x1={run * index / treadCount} y1={-width / 2} x2={run * index / treadCount} y2={width / 2} stroke="#846b57" strokeWidth="1.5" />)}
      {Array.from({ length: stringerCount }, (_, index) => { const localY = -width / 2 + width * index / Math.max(1, stringerCount - 1); return <line key={`stringer-${index}`} x1={headerX(localY)} y1={localY} x2={run} y2={localY} stroke="#9b5e2d" strokeWidth="1.6" strokeDasharray="5 3" />; })}
      {(handrailSides === 'left' || handrailSides === 'both') && <line x1="0" y1={-width / 2 - 6} x2={run} y2={-width / 2 - 6} stroke="#263b31" strokeWidth="4" />}
      {(handrailSides === 'right' || handrailSides === 'both') && <line x1="0" y1={width / 2 + 6} x2={run} y2={width / 2 + 6} stroke="#263b31" strokeWidth="4" />}
      <circle cx="0" cy="0" r={connectionNodeRadius} fill="white" stroke="#c26716" strokeWidth="3" /><text x="0" y="3" textAnchor="middle" fontSize={connectionNodeRadius < 8 ? 6 : 8} fontWeight="900" fill="#8d4811">A</text>
      <circle cx={stair.to.kind === 'platform' ? targetDistance : run} cy="0" r={connectionNodeRadius} fill="white" stroke="#c26716" strokeWidth="3" /><text x={stair.to.kind === 'platform' ? targetDistance : run} y="3" textAnchor="middle" fontSize={connectionNodeRadius < 8 ? 6 : 8} fontWeight="900" fill="#8d4811">B</text>
      <line x1="0" y1={width / 2 + 18} x2={run} y2={width / 2 + 18} stroke="#c26716" strokeWidth="1.5" />
      <text x={run / 2} y={width / 2 + 32} textAnchor="middle" fontSize="8" fontWeight="800" fill="#8d4811">RUN {stair.totalRunMm} mm</text>
      <line x1="-18" y1={-width / 2} x2="-18" y2={width / 2} stroke="#c26716" strokeWidth="1.5" />
      <text x="-28" y="0" transform="rotate(-90 -28 0)" textAnchor="middle" fontSize="8" fontWeight="800" fill="#8d4811">WIDTH {stair.widthMm} mm</text>
      {selected && <g>
        {stair.to.kind === 'terrain' && <g><circle cx={run / 2} cy="0" r="13" fill="#fff" stroke="#087553" strokeWidth="3" onPointerDown={onBeginMove} role="button" aria-label="Drag to move stair along platform edge" className="cursor-move" /><text x={run / 2} y="4" textAnchor="middle" fontSize="8" fontWeight="900" fill="#087553" pointerEvents="none">M</text></g>}
        <circle cx={run / 2} cy={-width / 2} r="12" fill="#fff" stroke="#c26716" strokeWidth="3" onPointerDown={onBeginWidthLeft} role="button" aria-label="Drag left stair edge; right edge stays fixed" className="cursor-ns-resize" />
        <text x={run / 2} y={-width / 2 + 3} textAnchor="middle" fontSize="8" fontWeight="900" fill="#8d4811" pointerEvents="none">L</text>
        <circle cx={run / 2} cy={width / 2} r="12" fill="#fff" stroke="#c26716" strokeWidth="3" onPointerDown={onBeginWidthRight} role="button" aria-label="Drag right stair edge; left edge stays fixed" className="cursor-ns-resize" />
        <text x={run / 2} y={width / 2 + 3} textAnchor="middle" fontSize="8" fontWeight="900" fill="#8d4811" pointerEvents="none">R</text>
        {stair.to.kind === 'terrain' && !stair.fromEdgeId && <g><line x1={run} y1="0" x2={run + 34} y2="0" stroke="#c26716" strokeWidth="2" strokeDasharray="4 3" /><circle cx={run + 34} cy="0" r="13" fill="#fff" stroke="#c26716" strokeWidth="3" onPointerDown={onBeginDirection} role="button" aria-label="Drag to rotate unattached stair around point A" className="cursor-grab" /><text x={run + 34} y="4" textAnchor="middle" fontSize="11" fontWeight="900" fill="#8d4811" pointerEvents="none">↻</text></g>}
      </g>}
    </g>
    <g transform={`translate(${labelX - x} ${labelY - y})`} pointerEvents="none">
      <rect x="-88" y="-28" width="176" height="56" rx="6" fill="white" stroke={selected ? '#c26716' : '#9caea4'} strokeWidth={selected ? 2 : 1} />
      <text x="0" y="-12" textAnchor="middle" fontSize="9" fontWeight="900" fill="#6f3d15">A → B · STAIRS TO {destination}</text>
      <text x="0" y="2" textAnchor="middle" fontSize="8" fontWeight="700" fill="#52665b">{stair.riserCount} RISERS @ {stair.riserHeightMm} · {treadCount} RUNS @ {stair.treadDepthMm}</text>
      <text x="0" y="16" textAnchor="middle" fontSize="8" fontWeight="700" fill="#52665b">{stringerCount} STRINGERS · PLAN {Math.round(stair.directionDeg)}° · RAIL {handrailSides.toUpperCase()}</text>
    </g>
  </g>;
}

function normalizePlanDegrees(value: number): number { return ((value % 360) + 360) % 360; }

/** Existing geometry stays visible as reference while a new platform owns every canvas click. */
export function existingLayersPointerEvents(mode: EditorMode): 'none' | undefined { return mode === 'draw' ? 'none' : undefined; }

function StairDraft({ startMm, endMm, riseMm, directionDeg, targetLabel, transform }: { startMm: PointMm; endMm: PointMm; riseMm: number; directionDeg: number; targetLabel: string; transform: Transform }) {
  const startX = transform.x(startMm[0]); const startY = transform.y(startMm[1]);
  const runMm = Math.round(distance(startMm, endMm));
  const geometry = proposePointToPointStairGeometry(riseMm, runMm);
  const proposedRunMm = geometry.status === 'valid' ? geometry.runMm : runMm;
  const run = proposedRunMm * transform.scale;
  const width = 900 * transform.scale;
  const angle = directionDeg;
  const endX = startX + Math.cos(angle * Math.PI / 180) * run;
  const endY = startY + Math.sin(angle * Math.PI / 180) * run;
  const cursorX = transform.x(endMm[0]); const cursorY = transform.y(endMm[1]);
  const valid = geometry.status === 'valid';
  const color = valid ? '#087553' : '#c2412d';
  const status = valid
    ? `Proposed: ${geometry.riserCount} risers @ ${geometry.riserHeightMm} · ${geometry.treadCount} runs/goings @ ${geometry.treadDepthMm}`
    : geometry.status === 'no-stair' ? 'No stair needed at this elevation' : 'Add an intermediate landing';
  return <g pointerEvents="none">
    <g transform={`translate(${startX} ${startY}) rotate(${angle})`}>
      <rect x="0" y={-width / 2} width={run} height={width} fill={valid ? 'rgba(8,117,83,.12)' : 'rgba(194,65,45,.08)'} stroke={color} strokeWidth="3" strokeDasharray={valid ? undefined : '8 5'} />
      {valid && Array.from({ length: (geometry.treadCount || 1) + 1 }, (_, index) => <line key={index} x1={run * index / (geometry.treadCount || 1)} y1={-width / 2} x2={run * index / (geometry.treadCount || 1)} y2={width / 2} stroke="#6d8076" />)}
      {valid && Array.from({ length: 3 }, (_, index) => <line key={`stringer-${index}`} x1="0" y1={-width / 2 + width * index / 2} x2={run} y2={-width / 2 + width * index / 2} stroke="#9b5e2d" strokeWidth="1.5" strokeDasharray="5 3" />)}
    </g>
    <circle cx={startX} cy={startY} r="11" fill="#fff" stroke={color} strokeWidth="3" /><text x={startX} y={startY + 3} textAnchor="middle" fontSize="8" fontWeight="900" fill={color}>A</text>
    <line x1={endX} y1={endY} x2={cursorX} y2={cursorY} stroke="#6d8076" strokeWidth="1.5" strokeDasharray="5 4" />
    <circle cx={endX} cy={endY} r="11" fill="#fff" stroke={color} strokeWidth="3" /><text x={endX} y={endY + 3} textAnchor="middle" fontSize="8" fontWeight="900" fill={color}>B</text>
    <rect x={(startX + endX) / 2 - 120} y={(startY + endY) / 2 - 54} width="240" height="42" rx="6" fill="white" stroke={color} />
    <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 38} textAnchor="middle" fontSize="9" fontWeight="900" fill={color}>STRINGERS SQUARE TO HEADER · PLAN {Math.round(directionDeg)}°</text>
    <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 23} textAnchor="middle" fontSize="8" fontWeight="700" fill="#52665b">{targetLabel} · {status}</text>
  </g>;
}

function DraftBoundary({ points, hoverPoint, transform, onClose }: { points: PointMm[]; hoverPoint: PointMm | null; transform: Transform; onClose: () => void }) {
  const previewPoints = hoverPoint ? [...points, hoverPoint] : points;
  const previous = points[points.length - 1];
  return <g pointerEvents="none">
    {points.length >= 3 && <polygon points={points.map(([x, y]) => `${transform.x(x)},${transform.y(y)}`).join(' ')} fill="rgba(23,79,58,.10)" stroke="none" />}
    <polyline points={previewPoints.map(([x, y]) => `${transform.x(x)},${transform.y(y)}`).join(' ')} fill="none" stroke="#087553" strokeWidth="4" strokeDasharray="10 6" />
    {hoverPoint && points.length >= 3 && <line x1={transform.x(hoverPoint[0])} y1={transform.y(hoverPoint[1])} x2={transform.x(points[0][0])} y2={transform.y(points[0][1])} stroke="#6ca18d" strokeWidth="2" strokeDasharray="5 5" />}
    {points.map(([x, y], index) => <g key={index}><circle cx={transform.x(x)} cy={transform.y(y)} r={index === 0 ? 13 : 7} fill={index === 0 ? '#087553' : 'white'} stroke="#087553" strokeWidth="3" pointerEvents={index === 0 && points.length >= 3 ? 'all' : 'none'} className={index === 0 && points.length >= 3 ? 'cursor-pointer' : undefined} onPointerDown={index === 0 && points.length >= 3 ? (event) => { event.preventDefault(); event.stopPropagation(); onClose(); } : undefined} /><text x={transform.x(x)} y={transform.y(y) + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill={index === 0 ? 'white' : '#087553'}>{index === 0 && points.length >= 3 ? '✓' : index + 1}</text></g>)}
    {hoverPoint && <circle cx={transform.x(hoverPoint[0])} cy={transform.y(hoverPoint[1])} r="6" fill="#cce8dc" stroke="#087553" strokeWidth="2" />}
    {hoverPoint && previous && <g>
      <rect x={(transform.x(previous[0]) + transform.x(hoverPoint[0])) / 2 - 44} y={(transform.y(previous[1]) + transform.y(hoverPoint[1])) / 2 - 24} width="88" height="18" rx="4" fill="#fff" stroke="#087553" />
      <text x={(transform.x(previous[0]) + transform.x(hoverPoint[0])) / 2} y={(transform.y(previous[1]) + transform.y(hoverPoint[1])) / 2 - 12} textAnchor="middle" fontSize="9" fontWeight="800" fill="#174f3a">{formatM(distance(previous, hoverPoint))} · {formatAngle(lineAngleDeg(previous, hoverPoint))}</text>
    </g>}
  </g>;
}

function ToolButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${active ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}>{icon}{label}</button>;
}

function houseEdgeIndex(points: PointMm[]): number | undefined { const index = points.findIndex((point, i) => { const next = points[(i + 1) % points.length]; return point[1] === 0 && next?.[1] === 0; }); return index >= 0 ? index : undefined; }
function defaultElevation(design: DeckDesign, site: SiteModel, boundary: ClosedBoundary): number {
  const stairLandingElevation = suggestedPlatformElevationForBoundary(design, boundary);
  if (stairLandingElevation !== null) return stairLandingElevation;
  const door = site.designWall.openings.find((opening) => opening.kind === 'door');
  if (door) return Math.max(site.terrain.datum.elevationMm + 150, door.sillHeightMm - 75);
  const center: PointMm = boundary.vertices.length ? [boundary.vertices.reduce((sum, point) => sum + point.xMm, 0) / boundary.vertices.length, boundary.vertices.reduce((sum, point) => sum + point.yMm, 0) / boundary.vertices.length] : [0, 0];
  return terrainElevationAt(site.terrain, center).elevationMm + 450;
}
function currentInstruction(count: number): string { return count < 3 ? `Place another corner. The line snaps every ${ANGLE_SNAP_DEG}°; hold Alt for a free angle.` : 'Click the first green point or choose Finish to close the platform.'; }
function snap(value: number): number { return Math.round(value / GRID_MM) * GRID_MM; }
function closeTargetMm(scale: number): number { return Math.max(100, Math.min(200, 10 / Math.max(.001, scale))); }
function clampZoom(value: number): number { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)); }
function pointOnEdge(platform: DeckPlatform, edgeIndex: number, pointer: PointMm): PointMm {
  const start = platform.boundary.vertices[edgeIndex]; const end = platform.boundary.vertices[(edgeIndex + 1) % platform.boundary.vertices.length];
  const edgeX = end.xMm - start.xMm; const edgeY = end.yMm - start.yMm; const lengthSquared = edgeX * edgeX + edgeY * edgeY;
  const t = Math.max(0.02, Math.min(0.98, lengthSquared ? ((pointer[0] - start.xMm) * edgeX + (pointer[1] - start.yMm) * edgeY) / lengthSquared : .5));
  return [Math.round(start.xMm + edgeX * t), Math.round(start.yMm + edgeY * t)];
}
function distance(first: PointMm, second: PointMm): number { return Math.hypot(second[0] - first[0], second[1] - first[1]); }
function midpoint(first: PointMm, second: PointMm): PointMm { return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]; }
function formatM(mm: number): string { return `${(mm / 1000).toFixed(2)} m`; }
function average(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function svgPoints(points: PointMm[], transform: Transform): string { return points.map(([x, y]) => `${transform.x(x)},${transform.y(y)}`).join(' '); }
function moneyRange(low: number, high: number): string { const format = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }); return `${format.format(low)}–${format.format(high)}`; }
