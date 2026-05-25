/**
 * Tests for CanvasInputController.
 *
 * Uses singleton state instances (reset between tests) and a hand-rolled
 * mock renderer — no DOM rendering or PixiJS required.
 *
 * Coverage:
 * - Wheel zoom: zoom level + panOffset anchor math
 * - Middle-click pan: cumulative delta applied to panOffset
 * - Left-click token drag: setTokenDragPreview called during drag,
 *   moveToken committed on release, snapToGrid applied
 * - Context menu: event prevented
 * - Non-middle buttons do not pan
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasInputController } from './canvas-input-controller';
import { viewportState } from '../state/viewport.svelte';
import { campaignState } from '../state/campaign.svelte';
import type { Token } from '@hearth-vtt/shared';

// ---------------------------------------------------------------------------
// Mock renderer
// ---------------------------------------------------------------------------

function makeMockRenderer(hitTokenId: string | null = null) {
  return {
    hitTestToken: vi.fn((_x: number, _y: number) => hitTokenId),
    setTokenDragPreview: vi.fn(),
    clearTokenDragPreview: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Minimal element stub (not a real DOM element)
// ---------------------------------------------------------------------------

function makeElement() {
  const listeners: Record<string, EventListener[]> = {};
  let capturedPointer = -1;

  const el = {
    addEventListener(type: string, fn: EventListener, _opts?: unknown) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: EventListener) {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== fn);
    },
    setPointerCapture(_id: number) {
      capturedPointer = _id;
    },
    releasePointerCapture() {
      capturedPointer = -1;
    },
    /** Helper: fire an event on this element. */
    fire(
      type: string,
      eventData: Partial<PointerEvent | WheelEvent | MouseEvent>,
    ) {
      const event = {
        currentTarget: el,
        preventDefault: vi.fn(),
        ...eventData,
      };
      for (const fn of listeners[type] ?? []) fn(event as unknown as Event);
      return event;
    },
    get capturedPointer() {
      return capturedPointer;
    },
  };
  return el;
}

type FakeElement = ReturnType<typeof makeElement>;

// ---------------------------------------------------------------------------
// Helpers to build pointer / wheel events
// ---------------------------------------------------------------------------

function ptr(overrides: Partial<PointerEvent> = {}): Partial<PointerEvent> {
  return {
    pointerId: 1,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    ...overrides,
  };
}

function wheel(overrides: Partial<WheelEvent> = {}): Partial<WheelEvent> {
  return {
    clientX: 0,
    clientY: 0,
    deltaY: 0,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let el: FakeElement;
let detach: () => void;

beforeEach(() => {
  viewportState.reset();
  campaignState.clear();
  el = makeElement();
});

function makeController(
  hitTokenId: string | null = null,
  onContextMenu = vi.fn(),
) {
  const renderer = makeMockRenderer(hitTokenId);
  const ctl = new CanvasInputController({
    viewportState,
    campaignState,
    renderer,
    onContextMenu,
  });
  detach = ctl.attach(el as unknown as HTMLElement);
  return { ctl, renderer, onContextMenu };
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

describe('contextmenu', () => {
  it('always prevents default', () => {
    makeController();
    const event = el.fire('contextmenu', { clientX: 50, clientY: 60 });
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('calls onContextMenu with kind:"token" when a token is hit', () => {
    const { onContextMenu } = makeController('tok-1');
    el.fire('contextmenu', { clientX: 50, clientY: 60 });
    expect(onContextMenu).toHaveBeenCalledWith({
      kind: 'token',
      tokenId: 'tok-1',
      screenX: 50,
      screenY: 60,
    });
  });

  it('calls onContextMenu with kind:"canvas" when no token is hit', () => {
    const { onContextMenu } = makeController(null);
    el.fire('contextmenu', { clientX: 100, clientY: 200 });
    expect(onContextMenu).toHaveBeenCalledWith({
      kind: 'canvas',
      screenX: 100,
      screenY: 200,
    });
  });

  it('does not call onContextMenu when no callback is provided', () => {
    // Construct manually with no callback — should not throw.
    const renderer = makeMockRenderer(null);
    const ctl = new CanvasInputController({
      viewportState,
      campaignState,
      renderer,
    });
    ctl.attach(el as unknown as HTMLElement);
    expect(() =>
      el.fire('contextmenu', { clientX: 0, clientY: 0 }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Middle-click pan
// ---------------------------------------------------------------------------

describe('middle-click pan', () => {
  it('pans by pointer delta', () => {
    makeController();
    el.fire(
      'pointerdown',
      ptr({ button: 1, pointerId: 2, clientX: 100, clientY: 100 }),
    );
    el.fire(
      'pointermove',
      ptr({ button: 1, pointerId: 2, clientX: 130, clientY: 110 }),
    );

    expect(viewportState.panOffset).toEqual({ x: 30, y: 10 });
  });

  it('accumulates across multiple moves', () => {
    makeController();
    el.fire(
      'pointerdown',
      ptr({ button: 1, pointerId: 2, clientX: 0, clientY: 0 }),
    );
    el.fire('pointermove', ptr({ pointerId: 2, clientX: 10, clientY: 0 }));
    el.fire('pointermove', ptr({ pointerId: 2, clientX: 25, clientY: 0 }));
    el.fire('pointermove', ptr({ pointerId: 2, clientX: 25, clientY: 5 }));

    expect(viewportState.panOffset).toEqual({ x: 25, y: 5 });
  });

  it('stops panning after pointer up', () => {
    makeController();
    el.fire(
      'pointerdown',
      ptr({ button: 1, pointerId: 2, clientX: 0, clientY: 0 }),
    );
    el.fire('pointermove', ptr({ pointerId: 2, clientX: 50, clientY: 0 }));
    el.fire(
      'pointerup',
      ptr({ button: 1, pointerId: 2, clientX: 50, clientY: 0 }),
    );
    el.fire('pointermove', ptr({ pointerId: 2, clientX: 100, clientY: 0 }));

    expect(viewportState.panOffset.x).toBe(50);
  });

  it('non-middle button does not pan', () => {
    makeController();
    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 0, clientY: 0 }),
    );
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 50, clientY: 0 }));

    expect(viewportState.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('resets on pointer cancel', () => {
    makeController();
    el.fire(
      'pointerdown',
      ptr({ button: 1, pointerId: 2, clientX: 0, clientY: 0 }),
    );
    el.fire('pointermove', ptr({ pointerId: 2, clientX: 20, clientY: 0 }));
    el.fire('pointercancel', ptr({ pointerId: 2 }));
    el.fire('pointermove', ptr({ pointerId: 2, clientX: 50, clientY: 0 }));

    // Pan stopped at 20; move after cancel is ignored
    expect(viewportState.panOffset.x).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Wheel zoom (cursor-anchored)
// ---------------------------------------------------------------------------

describe('wheel zoom', () => {
  it('zooms in (negative deltaY)', () => {
    makeController();
    el.fire('wheel', wheel({ clientX: 0, clientY: 0, deltaY: -100 }));

    expect(viewportState.zoom).toBeGreaterThan(1.0);
  });

  it('zooms out (positive deltaY)', () => {
    makeController();
    el.fire('wheel', wheel({ clientX: 0, clientY: 0, deltaY: 100 }));

    expect(viewportState.zoom).toBeLessThan(1.0);
  });

  it('does not exceed max zoom (5.0)', () => {
    makeController();
    viewportState.setZoom(4.9);
    el.fire('wheel', wheel({ clientX: 0, clientY: 0, deltaY: -10000 }));

    expect(viewportState.zoom).toBeLessThanOrEqual(5.0);
  });

  it('does not go below min zoom (0.1)', () => {
    makeController();
    viewportState.setZoom(0.15);
    el.fire('wheel', wheel({ clientX: 0, clientY: 0, deltaY: 10000 }));

    expect(viewportState.zoom).toBeGreaterThanOrEqual(0.1);
  });

  it('keeps the cursor world-point fixed (pan adjusts)', () => {
    makeController();
    // Start at zoom 1.0, pan at origin, cursor at (200, 150).
    const cursorX = 200;
    const cursorY = 150;

    // World point under cursor before zoom:
    const worldXBefore =
      (cursorX - viewportState.panOffset.x) / viewportState.zoom;
    const worldYBefore =
      (cursorY - viewportState.panOffset.y) / viewportState.zoom;

    el.fire(
      'wheel',
      wheel({ clientX: cursorX, clientY: cursorY, deltaY: -200 }),
    );

    const newZoom = viewportState.zoom;
    const worldXAfter = (cursorX - viewportState.panOffset.x) / newZoom;
    const worldYAfter = (cursorY - viewportState.panOffset.y) / newZoom;

    expect(worldXAfter).toBeCloseTo(worldXBefore, 5);
    expect(worldYAfter).toBeCloseTo(worldYBefore, 5);
  });

  it('prevents default to stop page scroll', () => {
    makeController();
    const event = el.fire('wheel', wheel({ deltaY: 100 }));
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Token drag
// ---------------------------------------------------------------------------

describe('token drag', () => {
  const TOKEN_ID = 'token-test';

  function addToken() {
    // Add a minimal token to campaignState so moveToken can find it.
    const token: Token = {
      id: TOKEN_ID,
      actorId: 'actor-1',
      sceneId: 'scene-1',
      position: { x: 100, y: 100 },
      size: 1,
    };
    campaignState.setInitialState({
      campaignId: 'c-1',
      campaignName: 'Test',
      activeSceneId: 'scene-1',
      tokens: [token],
    });
  }

  it('calls setTokenDragPreview during drag after threshold', () => {
    addToken();
    const { renderer } = makeController(TOKEN_ID);

    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 100, clientY: 100 }),
    );
    // Small move — below threshold → no preview yet
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 101, clientY: 100 }));
    expect(renderer.setTokenDragPreview).not.toHaveBeenCalled();

    // Cross the threshold (4px default)
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 106, clientY: 100 }));
    expect(renderer.setTokenDragPreview).toHaveBeenCalledWith(
      TOKEN_ID,
      expect.any(Object),
    );
  });

  it('calls clearTokenDragPreview and commits position on pointer up', () => {
    addToken();
    const { renderer } = makeController(TOKEN_ID);

    // Drop at x=140 → world x=140 → snapped to 150 (nearest multiple of 50)
    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 100, clientY: 100 }),
    );
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 140, clientY: 100 }));
    el.fire(
      'pointerup',
      ptr({ button: 0, pointerId: 1, clientX: 140, clientY: 100 }),
    );

    expect(renderer.clearTokenDragPreview).toHaveBeenCalledWith(TOKEN_ID);
    const moved = campaignState.getToken(TOKEN_ID);
    expect(moved?.position).not.toEqual({ x: 100, y: 100 }); // position was updated
  });

  it('snaps to grid when snapToGrid is true', () => {
    addToken();
    viewportState.snapToGrid = true;
    viewportState.setZoom(1.0);
    viewportState.setPan(0, 0);
    makeController(TOKEN_ID);

    // Drag token to screen (73, 73) → world (73, 73) → snapped to nearest 50 = 50
    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 100, clientY: 100 }),
    );
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 110, clientY: 100 }));
    el.fire(
      'pointerup',
      ptr({ button: 0, pointerId: 1, clientX: 73, clientY: 73 }),
    );

    const moved = campaignState.getToken(TOKEN_ID);
    expect(moved?.position.x).toBe(50);
    expect(moved?.position.y).toBe(50);
  });

  it('does NOT snap when snapToGrid is false', () => {
    addToken();
    viewportState.snapToGrid = false;
    viewportState.setZoom(1.0);
    viewportState.setPan(0, 0);
    makeController(TOKEN_ID);

    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 100, clientY: 100 }),
    );
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 110, clientY: 100 }));
    el.fire(
      'pointerup',
      ptr({ button: 0, pointerId: 1, clientX: 73, clientY: 73 }),
    );

    const moved = campaignState.getToken(TOKEN_ID);
    expect(moved?.position.x).toBe(73);
    expect(moved?.position.y).toBe(73);
  });

  it('does not commit if drag threshold was never crossed', () => {
    addToken();
    const { renderer } = makeController(TOKEN_ID);

    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 100, clientY: 100 }),
    );
    // Tiny move, release
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 101, clientY: 100 }));
    el.fire(
      'pointerup',
      ptr({ button: 0, pointerId: 1, clientX: 101, clientY: 100 }),
    );

    expect(renderer.clearTokenDragPreview).not.toHaveBeenCalled();
    const token = campaignState.getToken(TOKEN_ID);
    expect(token?.position).toEqual({ x: 100, y: 100 }); // unchanged
  });

  it('does not start drag when canDragToken returns false', () => {
    addToken();
    const renderer = makeMockRenderer(TOKEN_ID);
    const ctl = new CanvasInputController({
      viewportState,
      campaignState,
      renderer,
      canDragToken: () => false, // permission denied
    });
    detach = ctl.attach(el as unknown as HTMLElement);

    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 100, clientY: 100 }),
    );
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 110, clientY: 100 }));
    el.fire(
      'pointerup',
      ptr({ button: 0, pointerId: 1, clientX: 110, clientY: 100 }),
    );

    expect(renderer.setTokenDragPreview).not.toHaveBeenCalled();
    const token = campaignState.getToken(TOKEN_ID);
    expect(token?.position).toEqual({ x: 100, y: 100 }); // unchanged
  });

  it('ignores left-click when no token is hit', () => {
    addToken();
    const { renderer } = makeController(null); // no token under cursor

    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 500, clientY: 500 }),
    );
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 550, clientY: 500 }));
    el.fire(
      'pointerup',
      ptr({ button: 0, pointerId: 1, clientX: 550, clientY: 500 }),
    );

    expect(renderer.setTokenDragPreview).not.toHaveBeenCalled();
  });

  it('clears preview and resets on pointer cancel', () => {
    addToken();
    const { renderer } = makeController(TOKEN_ID);

    el.fire(
      'pointerdown',
      ptr({ button: 0, pointerId: 1, clientX: 100, clientY: 100 }),
    );
    el.fire('pointermove', ptr({ pointerId: 1, clientX: 110, clientY: 100 }));
    el.fire('pointercancel', ptr({ pointerId: 1 }));

    expect(renderer.clearTokenDragPreview).toHaveBeenCalledWith(TOKEN_ID);
    // Token position should NOT have been committed
    const token = campaignState.getToken(TOKEN_ID);
    expect(token?.position).toEqual({ x: 100, y: 100 });
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('detach', () => {
  it('removes listeners so events no longer affect state', () => {
    makeController();
    detach();

    el.fire(
      'pointerdown',
      ptr({ button: 1, pointerId: 2, clientX: 0, clientY: 0 }),
    );
    el.fire('pointermove', ptr({ pointerId: 2, clientX: 50, clientY: 0 }));

    expect(viewportState.panOffset).toEqual({ x: 0, y: 0 });
  });
});
