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
let wrapperEl: HTMLDivElement | null = $state(null);
let tooltipStyle = $state('');

function show() {
  if (timeoutId !== null) return; // Already showing or scheduled
  timeoutId = window.setTimeout(() => {
    visible = true;
    updateTooltipPosition();
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

/**
 * Calculate tooltip position relative to viewport.
 * This allows the tooltip to escape container overflow clipping.
 */
function updateTooltipPosition() {
  if (!wrapperEl) return;
  
  const rect = wrapperEl.getBoundingClientRect();
  const offset = 8; // spacing from target element
  
  let top = 0;
  let left = 0;
  
  switch (position) {
    case 'top':
      top = rect.top - offset;
      left = rect.left + rect.width / 2;
      break;
    case 'bottom':
      top = rect.bottom + offset;
      left = rect.left + rect.width / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2;
      left = rect.left - offset;
      break;
    case 'right':
      top = rect.top + rect.height / 2;
      left = rect.right + offset;
      break;
  }
  
  tooltipStyle = `top: ${top}px; left: ${left}px;`;
}
</script>

<div
  bind:this={wrapperEl}
  class="tooltip-wrapper"
  role="presentation"
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children()}
</div>

{#if visible}
  <div class="tooltip tooltip--{position}" role="tooltip" style={tooltipStyle}>
    {text}
  </div>
{/if}

<style>
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
  }

  .tooltip {
    position: fixed; /* Changed from absolute to fixed to escape container clipping */
    z-index: var(--z-tooltip);
    padding: 0.375rem 0.625rem;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-md);
  }

  /* Position variants - transform only handles centering */
  .tooltip--top {
    transform: translate(-50%, -100%);
  }

  .tooltip--bottom {
    transform: translate(-50%, 0);
  }

  .tooltip--left {
    transform: translate(-100%, -50%);
  }

  .tooltip--right {
    transform: translate(0, -50%);
  }
</style>
