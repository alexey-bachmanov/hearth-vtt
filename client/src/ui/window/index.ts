/**
 * Window UI components.
 *
 * Floating windows, modals, and popup dialogs.
 *
 * TabbedWindow is the primary shell; it handles single-tab (plain window)
 * and multi-tab (tab strip) layouts, dragging, and context menus.
 * FloatingWindowLayer hosts all TabbedWindow instances and is rendered once
 * at the top of PlayLayout.
 *
 * Content components (CharacterSheet, etc.) are registered in TabbedWindow's
 * WINDOW_CONTENT registry. They are exported here for direct use in tests
 * or standalone contexts.
 */

export { default as FloatingWindowLayer } from './FloatingWindowLayer.svelte';
export { default as TabbedWindow } from './TabbedWindow.svelte';
export { default as CharacterSheet } from './CharacterSheet.svelte';
export { default as DocumentReader } from './DocumentReader.svelte';
export { default as ItemInspector } from './ItemInspector.svelte';
// NOTE: InitiativeModal removed in Engine v0.2 Schema De-D&D-ification.
// Initiative is a ruleset-defined concern, not a core UI primitive.
// export { default as InitiativeModal } from './InitiativeModal.svelte';
