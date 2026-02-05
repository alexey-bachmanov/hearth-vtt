import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // enable run-time checks when not in production
    dev: process.env.NODE_ENV !== 'production',
  },
};
