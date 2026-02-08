<script lang="ts">
/**
 * Tooltip component.
 *
 * Custom positioned tooltip that appears on hover or focus.
 * Replaces native `title` attributes with accessible, styled tooltips.
 *
 * Usage:
 * <Tooltip text="Click to roll dice">
 *   <button>🎲</button>
 * </Tooltip>
 */

interface Props {
  /**
   * Tooltip text to display.
   */
  text: string;

  /**
   * Position relative to the target element.
   * @default 'top'
   */
  position?: 'top' | 'bottom' | 'left' | 'right';

  /**
   * Delay before showing tooltip (ms).
   * @default 500
   */
  delay?: number;
}

let {
  text,
  position = 'top',
  delay = 500,
  children,
}: Props & { children: any } = $props();

let visible = $state(false);
let timeoutId: number | null = null;

function show() {
  if (timeoutId !== null) return; // Already showing or scheduled
  timeoutId = window.setTimeout(() => {
    visible = true;
    timeoutId = null;
  }, delay);
}

function hide() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  visible = false;
}
</script>

<div
  class="tooltip-wrapper"
  role="presentation"
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children()}

  {#if visible}
    <div class="tooltip tooltip--{position}" role="tooltip">
      {text}
    </div>
  {/if}
</div>

<style>
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
  }

  .tooltip {
    position: absolute;
    z-index: var(--z-tooltip);
    padding: 0.375rem 0.625rem;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-md);
  }

  /* Position variants */
  .tooltip--top {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(-0.5rem);
  }

  .tooltip--bottom {
    top: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(0.5rem);
  }

  .tooltip--left {
    right: 100%;
    top: 50%;
    transform: translateY(-50%) translateX(-0.5rem);
  }

  .tooltip--right {
    left: 100%;
    top: 50%;
    transform: translateY(-50%) translateX(0.5rem);
  }
</style>
