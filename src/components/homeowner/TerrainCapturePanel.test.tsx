import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { addTerrainGradePoint, createTerrainSurface } from '../../domain/siteModel';
import { TerrainCapturePanel } from './TerrainCapturePanel';

describe('TerrainCapturePanel', () => {
  it('uses a controlled grade worksheet and exposes no professional-status shortcut', () => {
    let terrain = createTerrainSurface();
    terrain = addTerrainGradePoint(terrain, { label: 'Rear-left grade', xMm: 0, yMm: 1000, elevationMm: 0, source: 'assumed-datum', verificationStatus: 'reference', notes: '' });
    const html = renderToStaticMarkup(<TerrainCapturePanel terrain={terrain} captureEvidence={[]} onUpdateDatum={vi.fn()} onAddPoint={vi.fn()} onUpdatePoint={vi.fn()} onRemovePoint={vi.fn()} onRecord={vi.fn()} />);
    expect(html).toContain('Local-grade field worksheet');
    expect(html).toContain('Recoverable benchmark description');
    expect(html).toContain('I directly measured the benchmark and every listed grade point');
    expect(html).toContain('Record controlled grade worksheet');
    expect(html).toContain('No controlled local-grade field worksheet is recorded');
    expect(html).not.toContain('Professionally verified</option>');
    expect(html).not.toContain('Survey</option>');
  });
});
