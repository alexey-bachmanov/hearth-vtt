/**
 * TabbedWindow accessibility tests.
 *
 * Verifies ARIA attributes (role, aria-labelledby) and keyboard navigation
 * (Escape focuses the close button in single-tab mode).
 *
 * Note: TabbedWindow is a non-modal floating panel, so no focus trap is
 * applied and aria-modal is intentionally absent.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiState } from '../../state/ui.svelte.js';
import TabbedWindow from './TabbedWindow.svelte';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  uiState.reset();
});

function openWindow(title = 'Test Window') {
  uiState.openWindow({ type: 'actor-sheet', title });
  const groupId = [...uiState.windowGroups.keys()][0];
  return { groupId };
}

// ---------------------------------------------------------------------------
// ARIA attributes
// ---------------------------------------------------------------------------

describe('TabbedWindow ARIA attributes', () => {
  it('has role="dialog"', () => {
    const { groupId } = openWindow();
    render(TabbedWindow, { props: { groupId } });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not have aria-modal (non-modal floating panel)', () => {
    const { groupId } = openWindow();
    render(TabbedWindow, { props: { groupId } });
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
  });

  it('has aria-labelledby pointing at an element containing the window title', () => {
    const { groupId } = openWindow('My Character');
    render(TabbedWindow, { props: { groupId } });
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const labelEl = document.getElementById(labelId!);
    expect(labelEl).toBeInTheDocument();
    expect(labelEl!.textContent).toBe('My Character');
  });
});

// ---------------------------------------------------------------------------
// Escape key (single-tab mode)
// ---------------------------------------------------------------------------

describe('TabbedWindow Escape key', () => {
  it('moves focus to the close button on Escape in single-tab mode', async () => {
    const user = userEvent.setup();
    const { groupId } = openWindow();
    render(TabbedWindow, { props: { groupId } });

    // Focus the dialog itself, then press Escape.
    const dialog = screen.getByRole('dialog');
    dialog.focus();
    await user.keyboard('{Escape}');

    const closeBtn = screen.getByRole('button', { name: /close window/i });
    expect(document.activeElement).toBe(closeBtn);
  });
});
