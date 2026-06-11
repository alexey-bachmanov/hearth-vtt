/**
 * ActorPill component tests.
 *
 * Patterns:
 * - Pure component: no shared state or fetch; test via props only
 * - HP bar (width/color) is inside the dropdown: requires isActive=true
 * - CSS class presence tested via container.querySelector (only where class is the sole observable effect)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { Actor } from '@hearth-vtt/shared';
import ActorPill from './ActorPill.svelte';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeActor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'actor-1',
    name: 'Thorin',
    seatPermissions: {},
    data: {},
    ...overrides,
  };
}

function defaultProps(
  overrides: Partial<{
    actor: Actor;
    isActive: boolean;
    isReadOnly: boolean;
    ontoggle: (id: string) => void;
    oncenter: (id: string) => void;
    onopensheet: (id: string) => void;
  }> = {},
) {
  return {
    actor: makeActor(),
    isActive: false,
    ontoggle: vi.fn(),
    oncenter: vi.fn(),
    onopensheet: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Main pill rendering
// ---------------------------------------------------------------------------

describe('ActorPill main pill', () => {
  it('renders the actor name', () => {
    render(ActorPill, defaultProps({ actor: makeActor({ name: 'Thorin' }) }));
    expect(screen.getByText('Thorin')).toBeInTheDocument();
  });

  it('renders the main center button with accessible title', () => {
    render(ActorPill, defaultProps({ actor: makeActor({ name: 'Thorin' }) }));
    expect(screen.getByTitle('Center on Thorin')).toBeInTheDocument();
  });

  it('renders the dropdown toggle button', () => {
    render(ActorPill, defaultProps());
    expect(screen.getByTitle('Quick stats')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dropdown visibility
// ---------------------------------------------------------------------------
//
// D&D-specific dropdown tests (HP bar, AC, level/class, conditions) were
// removed in Engine v0.2 Schema De-D&D-ification. Stats now live in actor.data
// and will be rendered by ruleset-defined UI components (future work).

describe('ActorPill dropdown', () => {
  it('does not render the dropdown when isActive is false', () => {
    render(ActorPill, defaultProps({ isActive: false }));
    // The dropdown has a recognisable action button 'Open Sheet' inside
    expect(screen.queryByText('Open Sheet')).not.toBeInTheDocument();
  });

  it('renders the dropdown panel when isActive is true', () => {
    render(ActorPill, defaultProps({ isActive: true }));
    expect(screen.getByText('Open Sheet')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// isReadOnly
// ---------------------------------------------------------------------------

describe('ActorPill isReadOnly', () => {
  it('does not add readonly class when isReadOnly is false', () => {
    const { container } = render(
      ActorPill,
      defaultProps({ isReadOnly: false }),
    );
    expect(
      container.querySelector('.actor-pill--readonly'),
    ).not.toBeInTheDocument();
  });

  it('adds readonly class when isReadOnly is true', () => {
    const { container } = render(ActorPill, defaultProps({ isReadOnly: true }));
    expect(
      container.querySelector('.actor-pill--readonly'),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('ActorPill callbacks', () => {
  it('calls oncenter with actor ID when main button is clicked', () => {
    const oncenter = vi.fn();
    const actor = makeActor({ id: 'actor-abc' });
    render(ActorPill, defaultProps({ actor, oncenter }));

    fireEvent.click(screen.getByTitle('Center on Thorin'));

    expect(oncenter).toHaveBeenCalledOnce();
    expect(oncenter).toHaveBeenCalledWith('actor-abc');
  });

  it('calls ontoggle with actor ID when dropdown toggle is clicked', () => {
    const ontoggle = vi.fn();
    const actor = makeActor({ id: 'actor-abc' });
    render(ActorPill, defaultProps({ actor, ontoggle }));

    fireEvent.click(screen.getByTitle('Quick stats'));

    expect(ontoggle).toHaveBeenCalledOnce();
    expect(ontoggle).toHaveBeenCalledWith('actor-abc');
  });

  it('calls onopensheet with actor ID when Open Sheet button is clicked', () => {
    const onopensheet = vi.fn();
    const actor = makeActor({ id: 'actor-abc' });
    render(ActorPill, defaultProps({ actor, onopensheet, isActive: true }));

    fireEvent.click(screen.getByRole('button', { name: /open sheet/i }));

    expect(onopensheet).toHaveBeenCalledOnce();
    expect(onopensheet).toHaveBeenCalledWith('actor-abc');
  });

  it('calls oncenter with actor ID when Center button (in dropdown) is clicked', () => {
    const oncenter = vi.fn();
    const actor = makeActor({ id: 'actor-abc' });
    render(ActorPill, defaultProps({ actor, oncenter, isActive: true }));

    // The dropdown center button accessible name combines its title + text content
    fireEvent.click(screen.getByRole('button', { name: /center on token/i }));

    expect(oncenter).toHaveBeenCalledWith('actor-abc');
  });
});
