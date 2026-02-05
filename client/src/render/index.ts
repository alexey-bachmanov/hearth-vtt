/**
 * WebGL Renderer for HearthVTT.
 *
 * This module provides the WebGL rendering engine for the map, tokens,
 * fog of war, lighting, and visual effects.
 *
 * Architecture:
 * - Exposes stable public API defined in client.md
 * - UI components interact only through the Renderer interface
 * - All WebGL implementation details are internal
 *
 * Note: This is a stub implementation. Actual WebGL rendering will be
 * implemented in future phases.
 */

/**
 * Stub Renderer implementation.
 *
 * All methods are no-ops for now. Components can call these methods
 * without errors during UI development.
 */
export class Renderer {
  // Lifecycle
  init(_canvas: HTMLCanvasElement): void {
    console.log('[Renderer] init() called (stub)');
  }

  dispose(): void {
    console.log('[Renderer] dispose() called (stub)');
  }

  // Scene management
  setScene(scene: unknown): void {
    console.log('[Renderer] setScene() called (stub)', scene);
  }

  setAnimatedMap(videoUrl: string): void {
    console.log('[Renderer] setAnimatedMap() called (stub)', videoUrl);
  }

  // Token management
  updateTokens(tokens: unknown[]): void {
    console.log('[Renderer] updateTokens() called (stub)', tokens);
  }

  setTokenDragPreview(tokenId: string, position: unknown): void {
    console.log(
      '[Renderer] setTokenDragPreview() called (stub)',
      tokenId,
      position,
    );
  }

  clearTokenDragPreview(tokenId: string): void {
    console.log('[Renderer] clearTokenDragPreview() called (stub)', tokenId);
  }

  // Visibility and lighting
  updateVisibilityMask(mask: unknown): void {
    console.log('[Renderer] updateVisibilityMask() called (stub)', mask);
  }

  updateLights(lights: unknown[]): void {
    console.log('[Renderer] updateLights() called (stub)', lights);
  }

  // Effects and overlays
  addAoEEffect(effect: unknown): void {
    console.log('[Renderer] addAoEEffect() called (stub)', effect);
  }

  removeAoEEffect(effectId: string): void {
    console.log('[Renderer] removeAoEEffect() called (stub)', effectId);
  }

  showTargetingReticle(spec: unknown): void {
    console.log('[Renderer] showTargetingReticle() called (stub)', spec);
  }

  hideTargetingReticle(): void {
    console.log('[Renderer] hideTargetingReticle() called (stub)');
  }

  triggerVFX(vfx: unknown): void {
    console.log('[Renderer] triggerVFX() called (stub)', vfx);
  }

  // Annotations
  addAnnotation(annotation: unknown): void {
    console.log('[Renderer] addAnnotation() called (stub)', annotation);
  }

  removeAnnotation(annotationId: string): void {
    console.log('[Renderer] removeAnnotation() called (stub)', annotationId);
  }

  setMeasurementPreview(measurement: unknown | null): void {
    console.log(
      '[Renderer] setMeasurementPreview() called (stub)',
      measurement,
    );
  }

  // Obstruction (for client-side collision)
  getObstructions(): unknown {
    console.log('[Renderer] getObstructions() called (stub)');
    return null;
  }

  isPathValid(from: unknown, to: unknown, tokenSize: number): boolean {
    console.log('[Renderer] isPathValid() called (stub)', from, to, tokenSize);
    return true;
  }

  // Input handling
  onTokenClick(_callback: (tokenId: string) => void): void {
    console.log('[Renderer] onTokenClick() registered (stub)');
  }

  onMapClick(_callback: (position: unknown) => void): void {
    console.log('[Renderer] onMapClick() registered (stub)');
  }

  onTokenDragStart(_callback: (tokenId: string) => void): void {
    console.log('[Renderer] onTokenDragStart() registered (stub)');
  }

  onTokenDragEnd(
    _callback: (tokenId: string, position: unknown) => void,
  ): void {
    console.log('[Renderer] onTokenDragEnd() registered (stub)');
  }
}

/**
 * Create and return a singleton renderer instance.
 */
export const renderer = new Renderer();
