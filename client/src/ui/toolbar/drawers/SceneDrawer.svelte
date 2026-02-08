<script lang="ts">
/**
 * SceneDrawer component (GM only).
 *
 * Map browser and scene selector.
 */

import { campaignState } from '../../../state';

const scenes = $derived(Array.from(campaignState.scenes.values()));
const activeSceneId = $derived(campaignState.activeSceneId);
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <h3 class="drawer-section__title">Active Scene</h3>
    {#if activeSceneId}
      <div class="active-scene-card">
        <span class="active-scene-card__name">
          {campaignState.getActiveScene()?.name || 'Unknown Scene'}
        </span>
        <span class="badge badge--success">Active</span>
      </div>
    {:else}
      <p class="text-secondary">No active scene</p>
    {/if}
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Available Scenes</h3>
    <div class="scene-list">
      {#each scenes as scene}
        <button class="scene-item" class:scene-item--active={scene.id === activeSceneId}>
          <div class="scene-item__preview">
            <span class="scene-item__icon">🗺️</span>
          </div>
          <div class="scene-item__info">
            <span class="scene-item__name">{scene.name}</span>
            <span class="scene-item__meta">{scene.width}x{scene.height}px</span>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="drawer-section">
    <button class="btn btn-primary">New Scene</button>
  </div>
</div>

<style>
  .drawer-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .drawer-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .drawer-section__title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .active-scene-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
  }

  .active-scene-card__name {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .badge {
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  .badge--success {
    background-color: var(--color-success);
    color: white;
  }

  .scene-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .scene-item {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: transparent;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .scene-item:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border-hover);
  }

  .scene-item--active {
    border-color: var(--color-accent-primary);
    background-color: rgba(74, 158, 255, 0.1);
  }

  .scene-item__preview {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
  }

  .scene-item__icon {
    font-size: var(--font-size-2xl);
  }

  .scene-item__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .scene-item__name {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .scene-item__meta {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .text-secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }
</style>
