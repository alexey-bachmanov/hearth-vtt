import { describe, it, expect, beforeEach } from 'vitest';
import { viewportState } from './viewport.svelte.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  viewportState.reset();
});

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

describe('zoom', () => {
  it('initial zoom is 1.0', () => {
    expect(viewportState.zoom).toBe(1.0);
  });

  it('setZoom(2.0) sets zoom to 2.0', () => {
    viewportState.setZoom(2.0);
    expect(viewportState.zoom).toBe(2.0);
  });

  it('setZoom(0.05) clamps to minimum 0.1', () => {
    viewportState.setZoom(0.05);
    expect(viewportState.zoom).toBe(0.1);
  });

  it('setZoom(10) clamps to maximum 5.0', () => {
    viewportState.setZoom(10);
    expect(viewportState.zoom).toBe(5.0);
  });

  it('zoomIn(0.2) from 1.0 results in 1.2', () => {
    viewportState.zoomIn(0.2);
    expect(viewportState.zoom).toBeCloseTo(1.2);
  });

  it('zoomOut(0.3) from 1.0 results in 0.7', () => {
    viewportState.zoomOut(0.3);
    expect(viewportState.zoom).toBeCloseTo(0.7);
  });

  it('zoomIn past max clamps to 5.0', () => {
    viewportState.setZoom(4.9);
    viewportState.zoomIn(0.5);
    expect(viewportState.zoom).toBe(5.0);
  });

  it('zoomOut past min clamps to 0.1', () => {
    viewportState.setZoom(0.15);
    viewportState.zoomOut(0.5);
    expect(viewportState.zoom).toBe(0.1);
  });

  it('resetZoom() from any value resets to 1.0', () => {
    viewportState.setZoom(3.5);
    viewportState.resetZoom();
    expect(viewportState.zoom).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Pan
// ---------------------------------------------------------------------------

describe('pan', () => {
  it('initial panOffset is { x: 0, y: 0 }', () => {
    expect(viewportState.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('setPan(100, 200) sets panOffset to { x: 100, y: 200 }', () => {
    viewportState.setPan(100, 200);
    expect(viewportState.panOffset).toEqual({ x: 100, y: 200 });
  });

  it('panBy(50, -30) from { x: 100, y: 200 } results in { x: 150, y: 170 }', () => {
    viewportState.setPan(100, 200);
    viewportState.panBy(50, -30);
    expect(viewportState.panOffset).toEqual({ x: 150, y: 170 });
  });

  it('resetPan() resets panOffset to { x: 0, y: 0 }', () => {
    viewportState.setPan(300, 400);
    viewportState.resetPan();
    expect(viewportState.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('centerOn(500, 400, 1024, 768) sets correct panOffset', () => {
    viewportState.centerOn(500, 400, 1024, 768);
    const zoom = viewportState.zoom;
    expect(viewportState.panOffset).toEqual({
      x: 1024 / 2 - 500 * zoom,
      y: 768 / 2 - 400 * zoom,
    });
  });
});

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

describe('grid', () => {
  it("setGrid('hex', 60, '10ft') updates gridType, gridSize, and gridScale", () => {
    viewportState.setGrid('hex', 60, '10ft');
    expect(viewportState.gridType).toBe('hex');
    expect(viewportState.gridSize).toBe(60);
    expect(viewportState.gridScale).toBe('10ft');
  });

  it('setGridSize(25) sets gridSize to 25', () => {
    viewportState.setGridSize(25);
    expect(viewportState.gridSize).toBe(25);
  });

  it('setGridSize(5) clamps to minimum 10', () => {
    viewportState.setGridSize(5);
    expect(viewportState.gridSize).toBe(10);
  });

  it('setGridSize(300) clamps to maximum 200', () => {
    viewportState.setGridSize(300);
    expect(viewportState.gridSize).toBe(200);
  });

  it('toggleSnapToGrid() twice returns to initial value', () => {
    const initial = viewportState.snapToGrid;
    viewportState.toggleSnapToGrid();
    viewportState.toggleSnapToGrid();
    expect(viewportState.snapToGrid).toBe(initial);
  });
});

// ---------------------------------------------------------------------------
// Map name
// ---------------------------------------------------------------------------

describe('mapName', () => {
  it("setMapName('The Prancing Pony') updates mapName", () => {
    viewportState.setMapName('The Prancing Pony');
    expect(viewportState.mapName).toBe('The Prancing Pony');
  });
});
