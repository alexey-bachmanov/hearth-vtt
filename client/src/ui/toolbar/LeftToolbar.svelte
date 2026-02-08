<script lang="ts">
/**
 * LeftToolbar component.
 *
 * Narrow vertical icon bar (56px) with three sections:
 * - Quick tools (top): Dice, annotation, measurement, initiative, jukebox
 * - Big tools (middle): Journal, compendium, settings
 * - GM tools (bottom): Lighting, obstructions, scene, campaign prep, token library, game settings
 *
 * Clicking an icon toggles the corresponding drawer overlay.
 */

import { uiState, type ToolDrawerId } from '../../state/ui.svelte';
import { Icon, Tooltip } from '../shared';
import {
  Dice6,
  Pencil,
  Ruler,
  Swords,
  Music,
  BookOpen,
  Library,
  Settings,
  Lightbulb,
  Box,
  Map,
  Scroll,
  Users,
  Cog,
} from 'lucide-svelte';

interface ToolConfig {
  id: ToolDrawerId;
  icon: any;
  label: string;
  gmOnly?: boolean;
}

// Quick tools section
const quickTools: ToolConfig[] = [
  { id: 'dice', icon: Dice6, label: 'Dice Roller' },
  { id: 'annotation', icon: Pencil, label: 'Annotations' },
  { id: 'measurement', icon: Ruler, label: 'Measurement' },
  { id: 'initiative', icon: Swords, label: 'Initiative Tracker' },
  { id: 'jukebox', icon: Music, label: 'Jukebox' },
];

// Big tools section
const bigTools: ToolConfig[] = [
  { id: 'journal', icon: BookOpen, label: 'Journal' },
  { id: 'compendium', icon: Library, label: 'Compendium' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

// GM-only tools section
const gmTools: ToolConfig[] = [
  { id: 'lighting', icon: Lightbulb, label: 'Lighting Tools', gmOnly: true },
  { id: 'obstruction', icon: Box, label: 'Walls & Obstructions', gmOnly: true },
  { id: 'scene', icon: Map, label: 'Scene Browser', gmOnly: true },
  { id: 'campaign-prep', icon: Scroll, label: 'Campaign Prep', gmOnly: true },
  { id: 'token-library', icon: Users, label: 'Token Library', gmOnly: true },
  { id: 'game-settings', icon: Cog, label: 'Game Settings', gmOnly: true },
];

function handleToolClick(toolId: ToolDrawerId) {
  uiState.toggleToolDrawer(toolId);
}

function isActive(toolId: ToolDrawerId): boolean {
  return uiState.activeToolDrawer === toolId;
}
</script>

<div class="left-toolbar">
  <!-- Quick Tools Section -->
  <div class="toolbar-section">
    {#each quickTools as tool}
      <Tooltip text={tool.label} position="right">
        <button
          class="toolbar-icon-btn"
          class:toolbar-icon-btn--active={isActive(tool.id)}
          onclick={() => handleToolClick(tool.id)}
          aria-label={tool.label}
          aria-pressed={isActive(tool.id)}
        >
          <Icon icon={tool.icon} label={tool.label} size={24} />
        </button>
      </Tooltip>
    {/each}
  </div>

  <div class="toolbar-divider"></div>

  <!-- Big Tools Section -->
  <div class="toolbar-section">
    {#each bigTools as tool}
      <Tooltip text={tool.label} position="right">
        <button
          class="toolbar-icon-btn"
          class:toolbar-icon-btn--active={isActive(tool.id)}
          onclick={() => handleToolClick(tool.id)}
          aria-label={tool.label}
          aria-pressed={isActive(tool.id)}
        >
          <Icon icon={tool.icon} label={tool.label} size={24} />
        </button>
      </Tooltip>
    {/each}
  </div>

  <div class="toolbar-divider"></div>

  <!-- GM Tools Section -->
  {#if uiState.canAccessGMTools}
    <div class="toolbar-section toolbar-section--gm">
      {#each gmTools as tool}
        <Tooltip text={tool.label} position="right">
          <button
            class="toolbar-icon-btn"
            class:toolbar-icon-btn--active={isActive(tool.id)}
            onclick={() => handleToolClick(tool.id)}
            aria-label={tool.label}
            aria-pressed={isActive(tool.id)}
          >
            <Icon icon={tool.icon} label={tool.label} size={24} />
          </button>
        </Tooltip>
      {/each}
    </div>
  {/if}
</div>

<style>
  .left-toolbar {
    width: var(--toolbar-left-width);
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border-default);
    padding: var(--space-sm) var(--space-xs);
    gap: var(--space-xs);
    z-index: var(--z-toolbar);
  }

  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .toolbar-section--gm {
    margin-top: auto; /* Push to bottom */
  }

  .toolbar-divider {
    height: 1px;
    background-color: var(--color-border-subtle);
    margin: var(--space-xs) 0;
  }
</style>
