import { mount } from 'svelte';
import App from './App.svelte';

// Dev-mode console API for testing engine actions without building UI.
// See client/src/app/devtools.ts for the full `window.__hearth` surface.
// Tree-shaken entirely in production builds.
if (import.meta.env.DEV) {
  import('./app/devtools.ts');
}

/**
 * Mount the root App component to the DOM.
 *
 * Note: Svelte 5 uses mount() instead of new App().
 */
const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
