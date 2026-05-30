/**
 * DiceRollerDrawer component tests.
 *
 * Patterns:
 * - Mock wsClient.dispatch to intercept dispatches
 * - Quick-dice buttons dispatch '1dN' formulas
 * - Custom formula: valid input dispatches verbatim; malformed input shows error
 * - Uses async findByRole/waitFor for Svelte 5 reactive DOM updates
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

// ---------------------------------------------------------------------------
// Mock wsClient BEFORE component import (hoisted by Vitest)
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn().mockReturnValue('req-mock');

vi.mock('../../../api', () => ({
  wsClient: {
    dispatch: (actionType: string, payload: unknown) =>
      mockDispatch(actionType, payload),
  },
}));

import DiceRollerDrawer from './DiceRollerDrawer.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeFormula(text: string) {
  const input = screen.getByRole('textbox', { name: /dice formula/i });
  fireEvent.input(input, { target: { value: text } });
  return input;
}

function clickRoll() {
  fireEvent.click(screen.getByRole('button', { name: /^roll$/i }));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDispatch.mockClear();
});

// ---------------------------------------------------------------------------
// Quick-dice buttons
// ---------------------------------------------------------------------------

describe('DiceRollerDrawer quick dice', () => {
  it('clicking d4 dispatches dice.roll with formula 1d4', () => {
    render(DiceRollerDrawer);
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith('dice.roll', { formula: '1d4' });
  });

  it('clicking d6 dispatches dice.roll with formula 1d6', () => {
    render(DiceRollerDrawer);
    fireEvent.click(screen.getByRole('button', { name: 'd6' }));
    expect(mockDispatch).toHaveBeenCalledWith('dice.roll', { formula: '1d6' });
  });

  it('clicking d20 dispatches dice.roll with formula 1d20', () => {
    render(DiceRollerDrawer);
    fireEvent.click(screen.getByRole('button', { name: 'd20' }));
    expect(mockDispatch).toHaveBeenCalledWith('dice.roll', { formula: '1d20' });
  });

  it('clicking d100 dispatches dice.roll with formula 1d100', () => {
    render(DiceRollerDrawer);
    fireEvent.click(screen.getByRole('button', { name: 'd100' }));
    expect(mockDispatch).toHaveBeenCalledWith('dice.roll', {
      formula: '1d100',
    });
  });

  it('each quick-dice button dispatches exactly once per click', () => {
    render(DiceRollerDrawer);
    fireEvent.click(screen.getByRole('button', { name: 'd8' }));
    expect(mockDispatch).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Custom formula
// ---------------------------------------------------------------------------

describe('DiceRollerDrawer custom formula', () => {
  it('valid formula dispatches dice.roll verbatim', () => {
    render(DiceRollerDrawer);
    typeFormula('2d6+3');
    clickRoll();
    expect(mockDispatch).toHaveBeenCalledWith('dice.roll', {
      formula: '2d6+3',
    });
  });

  it('formula with keep-highest notation dispatches verbatim', () => {
    render(DiceRollerDrawer);
    typeFormula('4d6kh3');
    clickRoll();
    expect(mockDispatch).toHaveBeenCalledWith('dice.roll', {
      formula: '4d6kh3',
    });
  });

  it('malformed formula shows error and does not dispatch', async () => {
    render(DiceRollerDrawer);
    typeFormula('not$valid');
    clickRoll();
    expect(mockDispatch).not.toHaveBeenCalled();
    await screen.findByRole('alert');
  });

  it('malformed formula does not clear the input', () => {
    render(DiceRollerDrawer);
    const input = typeFormula('not$valid') as HTMLInputElement;
    clickRoll();
    expect(input.value).toBe('not$valid');
  });

  it('empty formula does not dispatch', () => {
    render(DiceRollerDrawer);
    typeFormula('   ');
    clickRoll();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
