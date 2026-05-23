/**
 * Layout components.
 *
 * Top-level layout shells for Play UI and Admin UI.
 * PlayLayoutBase and PlayLayoutOverlay are internal composition pieces consumed
 * only by PlayLayout.svelte — they are intentionally not re-exported here.
 */

export { default as PlayLayout } from './PlayLayout.svelte';
export { default as AdminLayout } from './AdminLayout.svelte';
