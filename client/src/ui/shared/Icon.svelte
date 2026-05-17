<script lang="ts">
/**
 * Icon wrapper component.
 *
 * Standardizes size, color, and accessibility for Lucide icons.
 * Provides consistent styling and aria-labels across the app.
 *
 * Usage:
 * <Icon icon={Dice6} label="Roll dice" size={20} />
 */

import type { ComponentType } from 'svelte';

interface Props {
  /**
   * Lucide icon component to render.
   * Pass any Lucide icon component (e.g., Dice6, Menu, X, etc.)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;

  /**
   * Accessible label for screen readers.
   */
  label: string;

  /**
   * Icon size in pixels.
   * @default 20
   */
  size?: number;

  /**
   * Icon color (CSS color value).
   * @default 'currentColor'
   */
  color?: string;

  /**
   * Stroke width for the icon.
   * @default 2
   */
  strokeWidth?: number;

  /**
   * Additional CSS class for styling.
   */
  class?: string;
}

let {
  icon: IconComponent,
  label,
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  class: className = '',
}: Props = $props();
</script>

<IconComponent
  {size}
  {color}
  stroke-width={strokeWidth}
  aria-label={label}
  class="icon {className}"
/>

<style>
  :global(.icon) {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
  }
</style>
