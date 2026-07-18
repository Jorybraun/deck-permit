import { describe, expect, it } from 'vitest';
import { addPlatform, addStair, assessDesign, createEmptyDesign, findHighestPlatformBelowPoint, insertPlatformVertex, movePlatform, movePlatformLayer, moveStair, nearestPlatformEdgePoint, rectangularBoundary, removePlatform, removeStair, resizeStairSide, rotatePlatform, setPlatformEdgeLength, setPlatformElevation, setPlatformEdgeRole, setPlatformPurpose, setStairConstruction, suggestPointToPointStair, suggestStairAtEdge, suggestStairBetweenEdges } from './deckDesign';

describe('multi-platform deck design contract', () => {
  it('owns arbitrary connected platform geometry without shape categories', () => {
    let design = createEmptyDesign('2026-07-18T00:00:00.000Z');
    design = addPlatform(design, {
      name: 'Door platform',
      boundary: rectangularBoundary(0, 0, 4200, 3000, 'A'),
      elevationMm: 900,
      houseEdgeIndex: 0,
    }, '2026-07-18T00:01:00.000Z');
    design = addPlatform(design, {
      name: 'Lower lounge',
      boundary: rectangularBoundary(4200, 1200, 2600, 3600, 'B'),
      elevationMm: 450,
    }, '2026-07-18T00:02:00.000Z');

    expect(design.platforms).toHaveLength(2);
    expect(design.platforms[0].edges[0].role).toBe('house');
    expect(design.platforms[1].elevationMm).toBe(450);
    expect(assessDesign(design).areaSqM).toBeCloseTo(21.96);
  });

  it('generates code-screened stair geometry between independent elevations', () => {
    let design = createEmptyDesign();
    design = addPlatform(design, { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    design = addPlatform(design, { boundary: rectangularBoundary(4000, 1000, 3000, 3000), elevationMm: 450 });
    design = addStair(design, {
      from: { kind: 'platform', platformId: 'P1' },
      to: { kind: 'platform', platformId: 'P2' },
      startMm: [3900, 1500],
      directionDeg: 0,
      widthMm: 900,
    });

    expect(design.stairs[0]).toMatchObject({ riserCount: 3, riserHeightMm: 150, treadDepthMm: 280, totalRunMm: 560 });
    expect(assessDesign(design).errors).toEqual([]);
  });

  it('blocks same-elevation overlapping platforms and cleans dependent stairs on removal', () => {
    let design = createEmptyDesign();
    design = addPlatform(design, { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    design = addPlatform(design, { boundary: rectangularBoundary(3000, 1000, 3000, 3000), elevationMm: 600 });
    expect(assessDesign(design).errors[0].message).toContain('overlap');
    design = setPlatformElevation(design, 'P2', 300);
    design = addStair(design, { from: { kind: 'platform', platformId: 'P1' }, to: { kind: 'platform', platformId: 'P2' }, startMm: [3500, 1500], directionDeg: 0 });
    expect(design.stairs).toHaveLength(1);
    expect(removePlatform(design, 'P2').stairs).toEqual([]);
  });

  it('moves a platform without converting it to a preset or global placement offset', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(-1000, 500, 4000, 2500), elevationMm: 700 });
    design = movePlatform(design, 'P1', 750, -250);
    expect(design.platforms[0].boundary.vertices[0]).toMatchObject({ xMm: -250, yMm: 250 });
  });

  it('rotates a platform around its centre without changing its edge identities or area', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 2000), elevationMm: 700 });
    const originalEdgeIds = design.platforms[0].edges.map((edge) => edge.id);
    design = rotatePlatform(design, 'P1', 90, '2026-07-18T01:00:00.000Z');
    expect(design.platforms[0].boundary.vertices).toEqual([
      { id: 'P1-V1', xMm: 3000, yMm: -1000 },
      { id: 'P1-V2', xMm: 3000, yMm: 3000 },
      { id: 'P1-V3', xMm: 1000, yMm: 3000 },
      { id: 'P1-V4', xMm: 1000, yMm: -1000 },
    ]);
    expect(design.platforms[0].edges.map((edge) => edge.id)).toEqual(originalEdgeIds);
    expect(assessDesign(design).areaSqM).toBeCloseTo(8);
  });

  it('rotates a yard stair as one assembly with its platform', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 2000), elevationMm: 600 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'terrain', elevationMm: 0 }, [4000, 1000], [4600, 1000]));
    design = rotatePlatform(design, 'P1', 90);
    expect(design.stairs[0]).toMatchObject({ startMm: [2000, 3000], endMm: [2000, 3600], directionDeg: 90 });
  });

  it('keeps the opposite landing fixed when rotating one of two stair-connected platforms', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 2000), elevationMm: 900 });
    design = addPlatform(design, { boundary: rectangularBoundary(4821, 0, 3000, 2000), elevationMm: 450 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'platform', platformId: 'P2' }, [4000, 1000], [4821, 1000], 'P2-E4'));
    design = rotatePlatform(design, 'P1', 90);
    expect(design.stairs[0].startMm).toEqual([2000, 3000]);
    expect(design.stairs[0].endMm).toEqual([4821, 1000]);
    expect(design.stairs[0].directionDeg).toBeCloseTo(324.7, 1);
  });

  it('suggests an outward stair at a selected platform edge', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    const input = suggestStairAtEdge(design.platforms[0], 'P1-E2', { kind: 'terrain', elevationMm: 0 });
    expect(input).toMatchObject({ startMm: [4000, 1500], directionDeg: 0 });
    design = addStair(design, input);
    expect(design.stairs[0]).toMatchObject({ riserCount: 3, riserHeightMm: 200 });
  });

  it('removes an accidental stair and releases its source edge', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    design = setPlatformEdgeRole(design, 'P1', 'P1-E2', 'stair');
    design = addStair(design, suggestStairAtEdge(design.platforms[0], 'P1-E2', { kind: 'terrain', elevationMm: 0 }));
    design = removeStair(design, 'ST1');
    expect(design.stairs).toEqual([]);
    expect(design.platforms[0].edges[1].role).toBe('open');
  });

  it('turns exact A and B points into a complete stair assembly', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    const input = suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'terrain', elevationMm: 0 }, [4000, 1500], [4600, 1500]);
    design = addStair(design, input);
    expect(design.stairs[0]).toMatchObject({ startMm: [4000, 1500], endMm: [4600, 1500], riserCount: 3, riserHeightMm: 200, treadDepthMm: 300, totalRunMm: 600, stringerCount: 3, handrailSides: 'both' });
    design = setStairConstruction(design, 'ST1', { widthMm: 1200, stringerCount: 4, handrailSides: 'left' });
    expect(design.stairs[0]).toMatchObject({ widthMm: 1200, landingDepthMm: 1200, stringerCount: 4, handrailSides: 'left' });
  });

  it('widens and rotates a yard stair as one assembly', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'terrain', elevationMm: 0 }, [4000, 1500], [4600, 1500]));
    design = setStairConstruction(design, 'ST1', { widthMm: 1800, directionDeg: 45 });
    expect(design.stairs[0]).toMatchObject({ widthMm: 1800, landingDepthMm: 1800, stringerCount: 5, directionDeg: 45, endMm: [4424, 1924] });
  });

  it('moves a stair assembly and resizes one side without moving the opposite edge', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'terrain', elevationMm: 0 }, [4000, 1500], [4600, 1500]));
    design = moveStair(design, 'ST1', 0, 300);
    expect(design.stairs[0]).toMatchObject({ startMm: [4000, 1800], endMm: [4600, 1800] });
    const fixedRightEdgeY = design.stairs[0].startMm[1] + design.stairs[0].widthMm / 2;
    design = resizeStairSide(design, 'ST1', 'left', 1400);
    expect(design.stairs[0]).toMatchObject({ widthMm: 1400, startMm: [4000, 1550], endMm: [4600, 1550], stringerCount: 5 });
    expect(design.stairs[0].startMm[1] + design.stairs[0].widthMm / 2).toBe(fixedRightEdgeY);
  });

  it('treats a rough yard point B as direction and proposes legal stair proportions', () => {
    const design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    const input = suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'terrain', elevationMm: 0 }, [4000, 1500], [4200, 1500]);
    expect(input).toMatchObject({ endMm: [4510, 1500], riserCount: 3, treadDepthMm: 255 });
  });

  it('uses a short landing extension to connect a legal stair to a selected lower platform', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    design = addPlatform(design, { boundary: rectangularBoundary(4821, 0, 3000, 3000), elevationMm: 450 });
    const input = suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'platform', platformId: 'P2' }, [4000, 1500], [4821, 1500], 'P2-E4');
    expect(input).toMatchObject({ endMm: [4821, 1500], riserCount: 3, treadDepthMm: 355, toEdgeId: 'P2-E4' });
  });

  it('connects chosen platform edges with a requested legal riser count', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Upper', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    design = addPlatform(design, { name: 'Lower', boundary: rectangularBoundary(5000, 0, 4000, 3000), elevationMm: 450 });
    const input = suggestStairBetweenEdges(design.platforms[0], 'P1-E2', design.platforms[1], 'P2-E4', 3);
    design = addStair(design, input);
    expect(design.stairs[0]).toMatchObject({ fromEdgeId: 'P1-E2', toEdgeId: 'P2-E4', riserCount: 3, riserHeightMm: 150, directionDeg: 0 });
    expect(() => addStair(design, { ...input, riserCount: 2 })).toThrow('between 125 mm and 200 mm');
  });

  it('edits freeform edges and drawing order without changing elevations', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Back', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 700 });
    design = addPlatform(design, { name: 'Front', boundary: rectangularBoundary(5000, 0, 3000, 2000), elevationMm: 300 });
    design = insertPlatformVertex(design, 'P1', 'P1-E1');
    expect(design.platforms[0].boundary.vertices).toHaveLength(5);
    design = setPlatformEdgeLength(design, 'P2', 'P2-E1', 4500);
    expect(design.platforms[1].boundary.vertices[1].xMm).toBe(9500);
    design = movePlatformLayer(design, 'P1', 1);
    expect(design.platforms.map((platform) => platform.name)).toEqual(['Front', 'Back']);
    expect(design.platforms[1].elevationMm).toBe(700);
  });

  it('treats an intermediate landing as a real platform and detects it below an upper deck', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Second floor deck', boundary: rectangularBoundary(0, 0, 5000, 3000), elevationMm: 3000 });
    design = addPlatform(design, { name: 'Half landing', purpose: 'landing', boundary: rectangularBoundary(1600, 800, 1800, 1400), elevationMm: 1500 });
    design = addPlatform(design, { name: 'Patio', boundary: rectangularBoundary(1800, 1000, 1200, 900), elevationMm: 300 });

    expect(findHighestPlatformBelowPoint(design, 'P1', [2200, 1400])?.id).toBe('P2');
    expect(findHighestPlatformBelowPoint(design, 'P2', [2200, 1400])?.id).toBe('P3');
    expect(nearestPlatformEdgePoint(design.platforms[1], [2200, 1400])).toMatchObject({ edgeId: 'P2-E1', pointMm: [2200, 800] });
    expect(setPlatformPurpose(design, 'P3', 'landing').platforms[2].purpose).toBe('landing');
  });

  it('models a second-floor stair as two runs connected by a landing level', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Upper deck', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 3000 });
    design = addPlatform(design, { name: 'Half landing', purpose: 'landing', boundary: rectangularBoundary(6200, 900, 1800, 1400), elevationMm: 1500 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'platform', platformId: 'P2' }, [4000, 1500], [6200, 1500], 'P2-E4'));
    design = addStair(design, suggestPointToPointStair(design, 'P2', 'P2-E2', { kind: 'terrain', elevationMm: 0 }, [8000, 1500], [10200, 1500]));

    expect(design.stairs).toHaveLength(2);
    expect(design.stairs.map((stair) => stair.riserCount * stair.riserHeightMm)).toEqual([1503, 1503]);
    expect(design.stairs[0].to).toEqual({ kind: 'platform', platformId: 'P2' });
    expect(design.stairs[1].from).toEqual({ kind: 'platform', platformId: 'P2' });
  });

  it('keeps both stair connection nodes attached when either connected platform moves', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Upper', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 900 });
    design = addPlatform(design, { name: 'Lower landing', purpose: 'landing', boundary: rectangularBoundary(4821, 0, 3000, 3000), elevationMm: 450 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'platform', platformId: 'P2' }, [4000, 1500], [4821, 1500], 'P2-E4'));

    design = movePlatform(design, 'P1', 0, 500);
    expect(design.stairs[0].startMm).toEqual([4000, 2000]);
    expect(design.stairs[0].endMm).toEqual([4821, 1500]);

    design = movePlatform(design, 'P2', 1000, 250);
    expect(design.stairs[0].startMm).toEqual([4000, 2000]);
    expect(design.stairs[0].endMm).toEqual([5821, 1750]);
    expect(design.stairs[0].fromEdgeT).toBeCloseTo(.5);
    expect(design.stairs[0].toEdgeT).toBeCloseTo(.5);
  });

  it('moves a stair-to-grade assembly with its anchored platform node', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 600 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'terrain', elevationMm: 0 }, [4000, 1500], [4600, 1500]));
    design = movePlatform(design, 'P1', 700, -300);
    expect(design.stairs[0]).toMatchObject({ startMm: [4700, 1200], endMm: [5300, 1200] });
  });

  it('recalculates both connected stair runs when a landing elevation changes', () => {
    let design = addPlatform(createEmptyDesign(), { name: 'Upper', boundary: rectangularBoundary(0, 0, 4000, 3000), elevationMm: 3000 });
    design = addPlatform(design, { name: 'Landing', purpose: 'landing', boundary: rectangularBoundary(6200, 0, 1800, 3000), elevationMm: 1500 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'platform', platformId: 'P2' }, [4000, 1500], [6200, 1500], 'P2-E4'));
    design = addStair(design, suggestPointToPointStair(design, 'P2', 'P2-E2', { kind: 'terrain', elevationMm: 0 }, [8000, 1500], [10200, 1500]));
    design = setPlatformElevation(design, 'P2', 1200);

    expect(design.stairs[0].riserCount * design.stairs[0].riserHeightMm).toBeCloseTo(1800, -1);
    expect(design.stairs[1].riserCount * design.stairs[1].riserHeightMm).toBeCloseTo(1200, -1);
  });

  it('flags stair openings that cannot form a square, adequately wide header connection', () => {
    let design = addPlatform(createEmptyDesign(), { boundary: rectangularBoundary(0, 0, 4000, 700), elevationMm: 600 });
    design = addStair(design, suggestPointToPointStair(design, 'P1', 'P1-E2', { kind: 'terrain', elevationMm: 0 }, [4000, 350], [4600, 350]));
    const messages = [...assessDesign(design).errors, ...assessDesign(design).warnings].map((issue) => issue.message);
    expect(messages.some((message) => message.includes('needs a 900 mm stair opening'))).toBe(true);
    expect(messages.some((message) => message.includes('header, trimmers, stringer attachment'))).toBe(true);
  });
});
