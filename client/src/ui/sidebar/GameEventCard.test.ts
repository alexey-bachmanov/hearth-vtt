/**
 * GameEventCard component tests.
 *
 * Patterns:
 * - Pass event fixture directly as prop — no state store needed
 * - Test rendered content using ARIA roles and text matchers
 * - Separate tests for chat.message and dice.rolled variants
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { GameEvent } from '../../state/campaign.svelte';
import GameEventCard from './GameEventCard.svelte';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeChatEvent(overrides: Partial<Extract<GameEvent, { type: 'chat.message' }>> = {}): GameEvent {
  return {
    id: 'evt-chat-1',
    timestamp: Date.now(),
    type: 'chat.message',
    displayName: 'Kael Sunblade',
    text: 'I stride into the tavern.',
    ...overrides,
  };
}

function makeDiceEvent(overrides: Partial<Extract<GameEvent, { type: 'dice.rolled' }>> = {}): GameEvent {
  return {
    id: 'evt-dice-1',
    timestamp: Date.now(),
    type: 'dice.rolled',
    displayName: 'Lyra Whisperwind',
    formula: '2d6+3',
    rolls: [4, 2],
    total: 9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// chat.message variant
// ---------------------------------------------------------------------------

describe('GameEventCard — chat.message', () => {
  it('renders the sender display name', () => {
    render(GameEventCard, { event: makeChatEvent() });
    expect(screen.getByText(/Kael Sunblade/)).toBeInTheDocument();
  });

  it('renders the message text', () => {
    render(GameEventCard, { event: makeChatEvent() });
    expect(screen.getByText(/I stride into the tavern/)).toBeInTheDocument();
  });

  it('renders a different display name correctly', () => {
    render(GameEventCard, {
      event: makeChatEvent({ displayName: 'GM', text: 'Roll for initiative!' }),
    });
    expect(screen.getByText(/GM/)).toBeInTheDocument();
    expect(screen.getByText(/Roll for initiative!/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// dice.rolled variant
// ---------------------------------------------------------------------------

describe('GameEventCard — dice.rolled', () => {
  it('renders the sender display name', () => {
    render(GameEventCard, { event: makeDiceEvent() });
    expect(screen.getByText(/Lyra Whisperwind/)).toBeInTheDocument();
  });

  it('renders the dice formula', () => {
    render(GameEventCard, { event: makeDiceEvent() });
    expect(screen.getByText(/2d6\+3/)).toBeInTheDocument();
  });

  it('renders individual rolls', () => {
    render(GameEventCard, { event: makeDiceEvent() });
    expect(screen.getByText(/4, 2/)).toBeInTheDocument();
  });

  it('renders the total', () => {
    render(GameEventCard, { event: makeDiceEvent() });
    expect(screen.getByText(/= 9/)).toBeInTheDocument();
  });

  it('renders multiple rolls correctly', () => {
    render(GameEventCard, {
      event: makeDiceEvent({ formula: '4d6kh3', rolls: [6, 4, 3, 1], total: 13 }),
    });
    expect(screen.getByText(/4d6kh3/)).toBeInTheDocument();
    expect(screen.getByText(/6, 4, 3, 1/)).toBeInTheDocument();
    expect(screen.getByText(/= 13/)).toBeInTheDocument();
  });
});
