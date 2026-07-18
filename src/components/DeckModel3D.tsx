import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import type { Deck } from '../types';
import { normalizeDeckLayout } from '../services/deckLayout';

export type ModelDisplayMode = 'finished' | 'framing';
export type ModelPart = 'decking' | 'joists' | 'beam' | 'posts' | 'footings' | 'railing' | 'stairs' | 'house';

interface DeckModel3DProps {
  deck: Deck;
  houseContext?: HouseModelContext | null;
  mode: ModelDisplayMode;
  showDimensions: boolean;
  selectedPart: ModelPart | null;
  onSelectPart: (part: ModelPart | null) => void;
}

export interface HouseModelContext {
  width: number;
  depth: number;
  wallHeight?: number;
  doorOpeningOffsetM?: number;
  doorOpeningWidthM?: number;
  doorThresholdHeightMm?: number;
  attachmentWall?: Deck['footprint']['houseWall'];
  source: 'municipal-roofline' | 'estimated' | 'field-input-unverified';
}

export function DeckModel3D({ deck, houseContext, mode, showDimensions, selectedPart, onSelectPart }: DeckModel3DProps) {
  const houseWidth = Math.max(deck.dimensions.width + 2.4, houseContext?.width || 7);
  const houseDepth = Math.max(4.5, houseContext?.depth || 6);
  const sceneSize = Math.max(houseWidth, houseDepth + deck.dimensions.depth);
  return (
    <div className="model-viewport" data-testid="deck-model-3d">
      <Canvas
        shadows
        camera={{ position: [sceneSize * 0.65, Math.max(5.7, sceneSize * 0.42), sceneSize * 0.7], fov: 38, near: 0.1, far: 100 }}
        onPointerMissed={() => onSelectPart(null)}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={['#e9eeeb']} />
        <fog attach="fog" args={['#e9eeeb', 14, 30]} />
        <ambientLight intensity={1.7} />
        <directionalLight position={[5, 9, 5]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} />
        <DeckScene
          deck={deck}
          houseContext={houseContext}
          mode={mode}
          showDimensions={showDimensions}
          selectedPart={selectedPart}
          onSelectPart={onSelectPart}
        />
        <Grid
          args={[30, 30]}
          position={[0, -0.012, 0]}
          cellSize={0.25}
          cellThickness={0.45}
          cellColor="#bdc9c1"
          sectionSize={1}
          sectionThickness={0.9}
          sectionColor="#8fa297"
          fadeDistance={22}
          infiniteGrid
        />
        <ContactShadows position={[0, 0, 0]} opacity={0.28} scale={18} blur={2.6} far={8} />
        <OrbitControls makeDefault minDistance={3.5} maxDistance={35} maxPolarAngle={Math.PI / 2.03} target={[0, deck.footprint.heightAboveGrade * 0.55, -houseDepth * 0.2]} />
      </Canvas>
      <div className="viewport-axis" aria-hidden="true"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
    </div>
  );
}

function DeckScene({ deck, houseContext, mode, showDimensions, selectedPart, onSelectPart }: DeckModel3DProps) {
  const { width, depth } = deck.dimensions;
  const height = deck.footprint.heightAboveGrade;
  const joistHeight = memberHeight(deck.structure.joistSize);
  const beamHeight = memberHeight(deck.structure.beamSize.split('-').pop() || '2x10');
  const joistCount = Math.max(2, Math.ceil(width / (deck.structure.joistSpacing / 1000)) + 1);
  const layout = normalizeDeckLayout(deck);
  const boardCount = Math.min(48, Math.max(5, Math.ceil(depth / 0.14)));
  const boardDepth = depth / boardCount;
  const deckColor = materialColor(deck.structure.deckingMaterial);
  const selectedColor = '#E29A55';
  const houseWidth = Math.max(width + 2.4, houseContext?.width || 7);
  const houseDepth = Math.max(4.5, houseContext?.depth || 6);
  const wallHeight = Math.max(2.4, houseContext?.wallHeight || 3.15);
  const roofRise = 1.25;
  const roofSlope = Math.atan((roofRise * 2) / houseDepth);
  const roofLength = Math.sqrt((houseDepth / 2) ** 2 + roofRise ** 2) + 0.35;
  const houseFront = -depth / 2;
  const houseCenterZ = houseFront - houseDepth / 2;
  const placement = deck.sitePlacement;
  const houseCenterX = placement
    ? -(placement.wallStartOffsetM + width / 2 - houseWidth / 2)
    : 0;
  const doorWidth = Math.min(houseWidth - 0.4, Math.max(0.6, houseContext?.doorOpeningWidthM || 0.95));
  const doorX = houseContext?.doorOpeningOffsetM === undefined
    ? width * 0.25
    : -houseWidth / 2 + houseContext.doorOpeningOffsetM + doorWidth / 2;
  const doorBottom = Math.max(0.02, (houseContext?.doorThresholdHeightMm || 25) / 1000);
  const doorHeight = Math.min(2.05, wallHeight - doorBottom - 0.15);

  const select = (part: ModelPart) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelectPart(part);
  };

  return (
    <group>
      <group position={[houseCenterX, 0, 0]} onClick={select('house')}>
        <mesh position={[0, wallHeight / 2, houseCenterZ]} receiveShadow castShadow>
          <boxGeometry args={[houseWidth, wallHeight, houseDepth]} />
          <meshStandardMaterial color={selectedPart === 'house' ? selectedColor : '#e7e2d8'} roughness={0.82} />
        </mesh>
        <mesh position={[0, wallHeight + roofRise / 2, houseCenterZ + houseDepth / 4]} rotation={[-roofSlope, 0, 0]} castShadow>
          <boxGeometry args={[houseWidth + 0.45, 0.16, roofLength]} />
          <meshStandardMaterial color="#48544d" roughness={0.9} />
        </mesh>
        <mesh position={[0, wallHeight + roofRise / 2, houseCenterZ - houseDepth / 4]} rotation={[roofSlope, 0, 0]} castShadow>
          <boxGeometry args={[houseWidth + 0.45, 0.16, roofLength]} />
          <meshStandardMaterial color="#48544d" roughness={0.9} />
        </mesh>
        <mesh position={[doorX, doorBottom + doorHeight / 2, houseFront + 0.012]}>
          <boxGeometry args={[doorWidth, doorHeight, 0.04]} />
          <meshStandardMaterial color="#456a67" metalness={0.1} roughness={0.45} />
        </mesh>
        <mesh position={[-width * 0.24, 1.55, houseFront + 0.014]}>
          <boxGeometry args={[1.25, 0.95, 0.04]} />
          <meshStandardMaterial color="#a9cbd0" metalness={0.15} roughness={0.25} />
        </mesh>
      </group>

      {(mode === 'finished' || mode === 'framing') && (
        <group onClick={select('decking')}>
          {Array.from({ length: boardCount }, (_, index) => (
            <mesh
              key={index}
              position={[0, height, -depth / 2 + boardDepth * (index + 0.5)]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[width, deck.structure.deckingThickness / 1000, Math.max(0.04, boardDepth - 0.009)]} />
              <meshStandardMaterial
                color={selectedPart === 'decking' ? selectedColor : deckColor}
                roughness={0.74}
                transparent={mode === 'framing'}
                opacity={mode === 'framing' ? 0.2 : 1}
              />
            </mesh>
          ))}
        </group>
      )}

      <group visible={mode === 'framing'} onClick={select('joists')}>
        {Array.from({ length: joistCount }, (_, index) => {
          const x = -width / 2 + (width * index) / (joistCount - 1);
          return (
            <mesh key={index} position={[x, height - joistHeight / 2 - 0.025, 0]} castShadow>
              <boxGeometry args={[0.045, joistHeight, depth]} />
              <meshStandardMaterial color={selectedPart === 'joists' ? selectedColor : '#c49a67'} roughness={0.8} />
            </mesh>
          );
        })}
      </group>

      <group onClick={select('beam')}>
        {layout.beamOffsetsFromHouseM.map((offset) => <mesh key={offset} position={[0, height - joistHeight - beamHeight / 2, -depth / 2 + offset]} castShadow>
          <boxGeometry args={[width + 0.1, beamHeight, 0.14]} />
          <meshStandardMaterial color={selectedPart === 'beam' ? selectedColor : '#9d7047'} roughness={0.85} />
        </mesh>)}
      </group>

      <group onClick={select('posts')}>
        {layout.beamOffsetsFromHouseM.flatMap((beamOffset) => layout.postStationsM.map((station) => {
          const x = -width / 2 + station;
          const postHeight = Math.max(0.08, height - joistHeight - beamHeight);
          return (
            <mesh key={`${beamOffset}-${station}`} position={[x, postHeight / 2, -depth / 2 + beamOffset]} castShadow>
              <boxGeometry args={[0.14, postHeight, 0.14]} />
              <meshStandardMaterial color={selectedPart === 'posts' ? selectedColor : '#8e6747'} roughness={0.9} />
            </mesh>
          );
        }))}
      </group>

      <group visible={mode === 'framing'} onClick={select('footings')}>
        {layout.beamOffsetsFromHouseM.flatMap((beamOffset) => layout.postStationsM.map((station) => {
          const x = -width / 2 + station;
          return (
            <mesh key={`${beamOffset}-${station}`} position={[x, 0.04, -depth / 2 + beamOffset]} castShadow>
              <cylinderGeometry args={[deck.structure.footingSize / 1900, deck.structure.footingSize / 1600, 0.08, 24]} />
              <meshStandardMaterial color={selectedPart === 'footings' ? selectedColor : '#a8aaa6'} roughness={1} />
            </mesh>
          );
        }))}
      </group>

      {deck.guard.enabled && mode === 'finished' && (
        <RailingModel deck={deck} selected={selectedPart === 'railing'} onSelect={select('railing')} />
      )}
      {deck.stairs.enabled && mode === 'finished' && (
        <StairModel deck={deck} selected={selectedPart === 'stairs'} onSelect={select('stairs')} />
      )}
      {showDimensions && <DimensionLines deck={deck} />}
    </group>
  );
}

function RailingModel({ deck, selected, onSelect }: { deck: Deck; selected: boolean; onSelect: (event: ThreeEvent<MouseEvent>) => void }) {
  const { width, depth } = deck.dimensions;
  const deckHeight = deck.footprint.heightAboveGrade;
  const guardHeight = deck.guard.height / 1000;
  const material = deck.guard.material.toLowerCase();
  const isGlass = material.includes('glass');
  const isWood = material.includes('wood') || material.includes('cedar');
  const color = selected ? '#E29A55' : isWood ? '#8b5634' : '#202624';
  const postSize = isWood ? 0.09 : 0.045;
  const frontPostCount = Math.max(2, Math.ceil(width / 1.2) + 1);
  const sidePostCount = Math.max(2, Math.ceil(depth / 1.2) + 1);

  return (
    <group onClick={onSelect}>
      {[...Array(frontPostCount)].map((_, index) => {
        const x = -width / 2 + (width * index) / (frontPostCount - 1);
        return <RailPost key={`f-${index}`} position={[x, deckHeight + guardHeight / 2, depth / 2]} size={postSize} height={guardHeight} color={color} />;
      })}
      {[...Array(sidePostCount)].flatMap((_, index) => {
        const z = -depth / 2 + (depth * index) / (sidePostCount - 1);
        return [
          <RailPost key={`l-${index}`} position={[-width / 2, deckHeight + guardHeight / 2, z]} size={postSize} height={guardHeight} color={color} />,
          <RailPost key={`r-${index}`} position={[width / 2, deckHeight + guardHeight / 2, z]} size={postSize} height={guardHeight} color={color} />,
        ];
      })}
      <Rail position={[0, deckHeight + guardHeight, depth / 2]} size={[width, 0.055, 0.07]} color={color} />
      <Rail position={[-width / 2, deckHeight + guardHeight, 0]} size={[0.07, 0.055, depth]} color={color} />
      <Rail position={[width / 2, deckHeight + guardHeight, 0]} size={[0.07, 0.055, depth]} color={color} />
      {isGlass ? (
        <>
          <GlassPanel position={[0, deckHeight + guardHeight * 0.52, depth / 2]} size={[width - 0.12, guardHeight * 0.82, 0.018]} />
          <GlassPanel position={[-width / 2, deckHeight + guardHeight * 0.52, 0]} size={[0.018, guardHeight * 0.82, depth - 0.12]} />
          <GlassPanel position={[width / 2, deckHeight + guardHeight * 0.52, 0]} size={[0.018, guardHeight * 0.82, depth - 0.12]} />
        </>
      ) : (
        <>
          <Rail position={[0, deckHeight + guardHeight * 0.52, depth / 2]} size={[width, 0.035, 0.035]} color={color} />
          <Rail position={[-width / 2, deckHeight + guardHeight * 0.52, 0]} size={[0.035, 0.035, depth]} color={color} />
          <Rail position={[width / 2, deckHeight + guardHeight * 0.52, 0]} size={[0.035, 0.035, depth]} color={color} />
        </>
      )}
    </group>
  );
}

function StairModel({ deck, selected, onSelect }: { deck: Deck; selected: boolean; onSelect: (event: ThreeEvent<MouseEvent>) => void }) {
  const { width, depth } = deck.dimensions;
  const layout = normalizeDeckLayout(deck);
  const rise = deck.footprint.heightAboveGrade / deck.stairs.numRisers;
  const run = deck.stairs.treadRun / 1000;
  const color = selected ? '#E29A55' : materialColor(deck.structure.deckingMaterial);
  return (
    <group onClick={onSelect}>
      {Array.from({ length: deck.stairs.numRisers }, (_, index) => {
        const remaining = deck.stairs.numRisers - index;
        const outward = run * (index + 0.5);
        const horizontal = deck.stairs.edge === 'north' || deck.stairs.edge === 'south';
        const along = layout.stairOffsetM + deck.stairs.width / 2;
        const position: [number, number, number] = deck.stairs.edge === 'south'
          ? [-width / 2 + along, rise * remaining / 2, depth / 2 + outward]
          : deck.stairs.edge === 'north'
            ? [-width / 2 + along, rise * remaining / 2, -depth / 2 - outward]
            : deck.stairs.edge === 'east'
              ? [width / 2 + outward, rise * remaining / 2, -depth / 2 + along]
              : [-width / 2 - outward, rise * remaining / 2, -depth / 2 + along];
        return (
          <mesh key={index} position={position} castShadow>
            <boxGeometry args={horizontal ? [deck.stairs.width, rise * remaining, run] : [run, rise * remaining, deck.stairs.width]} />
            <meshStandardMaterial color={color} roughness={0.78} />
          </mesh>
        );
      })}
    </group>
  );
}

function DimensionLines({ deck }: { deck: Deck }) {
  const { width, depth } = deck.dimensions;
  const height = deck.footprint.heightAboveGrade;
  const lineColor = '#25635A';
  return (
    <group>
      <Line points={[[-width / 2, 0.05, depth / 2 + 0.55], [width / 2, 0.05, depth / 2 + 0.55]]} color={lineColor} lineWidth={1.4} />
      <DimensionLabel position={[0, 0.08, depth / 2 + 0.55]} text={`${width.toFixed(2)} m`} />
      <Line points={[[-width / 2 - 0.55, 0.05, -depth / 2], [-width / 2 - 0.55, 0.05, depth / 2]]} color={lineColor} lineWidth={1.4} />
      <DimensionLabel position={[-width / 2 - 0.55, 0.08, 0]} text={`${depth.toFixed(2)} m`} />
      <Line points={[[width / 2 + 0.45, 0, -depth / 2], [width / 2 + 0.45, height, -depth / 2]]} color={lineColor} lineWidth={1.4} />
      <DimensionLabel position={[width / 2 + 0.45, height / 2, -depth / 2]} text={`${(height * 1000).toFixed(0)} mm`} />
    </group>
  );
}

function DimensionLabel({ position, text }: { position: [number, number, number]; text: string }) {
  return <Html position={position} center distanceFactor={8}><span className="model-dimension-label">{text}</span></Html>;
}

function RailPost({ position, size, height, color }: { position: [number, number, number]; size: number; height: number; color: string }) {
  return <mesh position={position} castShadow><boxGeometry args={[size, height, size]} /><meshStandardMaterial color={color} roughness={0.65} metalness={0.15} /></mesh>;
}

function Rail({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  return <mesh position={position} castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.58} metalness={0.22} /></mesh>;
}

function GlassPanel({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return <mesh position={position}><boxGeometry args={size} /><meshPhysicalMaterial color="#b9e4e4" transparent opacity={0.32} roughness={0.12} metalness={0.05} transmission={0.45} /></mesh>;
}

function memberHeight(size: string): number {
  if (size.includes('2x12')) return 0.286;
  if (size.includes('2x10')) return 0.235;
  if (size.includes('2x8')) return 0.184;
  return 0.14;
}

function materialColor(material: string): string {
  const normalized = material.toLowerCase();
  if (normalized.includes('cedar')) return '#b66f42';
  if (normalized.includes('walnut')) return '#574037';
  if (normalized.includes('driftwood')) return '#85847d';
  return '#a39770';
}
