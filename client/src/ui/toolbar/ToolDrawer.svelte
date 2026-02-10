<script lang="ts">
/**
 * ToolDrawer component.
 *
 * Slide-out panel (320px) that overlays the canvas from the left.
 * Renders the appropriate drawer content based on uiState.activeToolDrawer.
 *
 * Features:
 * - Smooth CSS transition (transform: translateX)
 * - Click-outside or Escape to close
 * - Header with title + close button
 * - Scrollable content area
 */

import { uiState, type ToolDrawerId } from '../../state/ui.svelte';
import { Icon } from '../shared';
import { X } from 'lucide-svelte';

// Import all drawer content components
import DiceRollerDrawer from './drawers/DiceRollerDrawer.svelte';
import AnnotationDrawer from './drawers/AnnotationDrawer.svelte';
import MeasurementDrawer from './drawers/MeasurementDrawer.svelte';
import InitiativeDrawer from './drawers/InitiativeDrawer.svelte';
import JukeboxDrawer from './drawers/JukeboxDrawer.svelte';
import JournalDrawer from './drawers/JournalDrawer.svelte';
import CompendiumDrawer from './drawers/CompendiumDrawer.svelte';
import SettingsDrawer from './drawers/SettingsDrawer.svelte';
import LightingDrawer from './drawers/LightingDrawer.svelte';
import ObstructionDrawer from './drawers/ObstructionDrawer.svelte';
import SceneDrawer from './drawers/SceneDrawer.svelte';
import CampaignPrepDrawer from './drawers/CampaignPrepDrawer.svelte';
import TokenLibraryDrawer from './drawers/TokenLibraryDrawer.svelte';
import GameSettingsDrawer from './drawers/GameSettingsDrawer.svelte';

// Drawer configuration
const drawerConfig: Record<
  ToolDrawerId,
  { title: string; component: any }
> = {
  dice: { title: 'Dice Roller', component: DiceRollerDrawer },
  annotation: { title: 'Annotations', component: AnnotationDrawer },
  measurement: { title: 'Measurement', component: MeasurementDrawer },
  initiative: { title: 'Initiative Tracker', component: InitiativeDrawer },
  jukebox: { title: 'Jukebox', component: JukeboxDrawer },
  journal: { title: 'Journal', component: JournalDrawer },
  compendium: { title: 'Compendium', component: CompendiumDrawer },
  settings: { title: 'Settings', component: SettingsDrawer },
  lighting: { title: 'Lighting Tools', component: LightingDrawer },
  obstruction: { title: 'Walls & Obstructions', component: ObstructionDrawer },
  scene: { title: 'Scene Browser', component: SceneDrawer },
  'campaign-prep': { title: 'Campaign Prep', component: CampaignPrepDrawer },
  'token-library': { title: 'Token Library', component: TokenLibraryDrawer },
  'game-settings': { title: 'Game Settings', component: GameSettingsDrawer },
};

let drawerElement: HTMLDivElement | null = $state(null);
let showContent = $state(false);
let previousDrawerId: ToolDrawerId | null = $state(null);

$effect(() => {
  const currentDrawerId = uiState.activeToolDrawer;
  
  if (currentDrawerId && !previousDrawerId) {
    // Opening drawer for first time
    showContent = false;
  } else if (!currentDrawerId && previousDrawerId) {
    // Closing drawer
    showContent = false;
  } else if (currentDrawerId && previousDrawerId && currentDrawerId !== previousDrawerId) {
    // Switching between drawers - keep content visible for smooth transition
    showContent = true;
  }
  
  previousDrawerId = currentDrawerId;
});

$effect(() => {
  // Handle Escape key to close drawer
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && uiState.activeToolDrawer) {
      uiState.closeToolDrawer();
    }
  }

  // Handle click outside to close drawer
  function handleClickOutside(event: MouseEvent) {
    if (
      uiState.activeToolDrawer &&
      drawerElement &&
      !drawerElement.contains(event.target as Node)
    ) {
      // Check if click is on the left toolbar (don't close if clicking toolbar)
      const target = event.target as HTMLElement;
      if (!target.closest('.left-toolbar')) {
        uiState.closeToolDrawer();
      }
    }
  }

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mousedown', handleClickOutside);

  return () => {
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('mousedown', handleClickOutside);
  };
});

function handleClose() {
  uiState.closeToolDrawer();
}

function handleTransitionEnd(event: TransitionEvent) {
  // Only respond to width/flex-basis transitions on the drawer itself
  if ((event.propertyName === 'flex-basis' || event.propertyName === 'width') && 
      event.target === drawerElement && 
      uiState.activeToolDrawer) {
    showContent = true;
  }
}

// Get current drawer config
$effect.pre(() => {
  // This effect ensures reactivity to activeToolDrawer changes
});

const currentDrawer = $derived(
  uiState.activeToolDrawer ? drawerConfig[uiState.activeToolDrawer] : null
);
const isOpen = $derived(uiState.activeToolDrawer !== null);
</script>

<div
  bind:this={drawerElement}
  class="drawer drawer--left"
  class:drawer--closed={!isOpen}
  role="dialog"
  aria-hidden={!isOpen}
  aria-label={currentDrawer?.title || 'Tool Drawer'}
  ontransitionend={handleTransitionEnd}
>
  {#if currentDrawer && showContent}
    {@const DrawerComponent = currentDrawer.component}
    <div class="drawer__header">
      <h2 class="drawer__title">{currentDrawer.title}</h2>
      <button
        class="drawer__close"
        onclick={handleClose}
        aria-label="Close drawer"
      >
        <Icon icon={X} label="Close" size={20} />
      </button>
    </div>

    <div class="drawer__content">
      <DrawerComponent />
    </div>
  {/if}
</div>

