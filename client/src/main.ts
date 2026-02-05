/**
 * HearthVTT Client Entry Point
 *
 * Bootstraps the Svelte 5 application.
 */

import { mount } from 'svelte';
import App from './App.svelte';

/**
 * Mount the root App component to the DOM.
 *
 * Note: Svelte 5 uses mount() instead of new App().
 */
const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
