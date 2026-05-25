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
    type: 'pc',
    seatPermissions: {},
    hp: { current: 10, max: 20 },
    ac: 16,
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

describe('ActorPill dropdown', () => {
  it('does not render the dropdown when isActive is false', () => {
    render(ActorPill, defaultProps({ isActive: false }));
    // The dropdown has a recognisable action button 'Center' inside
    expect(screen.queryByText('Open Sheet')).not.toBeInTheDocument();
  });

  it('renders the dropdown panel when isActive is true', () => {
    render(ActorPill, defaultProps({ isActive: true }));
    expect(screen.getByText('Open Sheet')).toBeInTheDocument();
  });

  it('shows HP current / max text in the dropdown', () => {
    const actor = makeActor({ hp: { current: 7, max: 30 } });
    render(ActorPill, defaultProps({ actor, isActive: true }));
    expect(screen.getByText('7 / 30')).toBeInTheDocument();
  });

  it('shows AC value in the dropdown', () => {
    const actor = makeActor({ ac: 18 });
    render(ActorPill, defaultProps({ actor, isActive: true }));
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('shows level and class when both are provided', () => {
    const actor = makeActor({ level: 5, class: 'Fighter' });
    render(ActorPill, defaultProps({ actor, isActive: true }));
    expect(screen.getByText('5 Fighter')).toBeInTheDocument();
  });

  it('does not show level/class row when either is absent', () => {
    const actor = makeActor({ level: undefined, class: undefined });
    render(ActorPill, defaultProps({ actor, isActive: true }));
    expect(screen.queryByText(/Fighter/)).not.toBeInTheDocument();
  });

  it('shows "Concentrating" status tag when isConcentrating is true', () => {
    const actor = makeActor({ isConcentrating: true });
    render(ActorPill, defaultProps({ actor, isActive: true }));
    expect(screen.getByText('Concentrating')).toBeInTheDocument();
  });

  it('shows condition tags when conditions are present', () => {
    const actor = makeActor({ conditions: ['Poisoned', 'Frightened'] });
    render(ActorPill, defaultProps({ actor, isActive: true }));
    expect(screen.getByText('Poisoned')).toBeInTheDocument();
    expect(screen.getByText('Frightened')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// HP bar
// ---------------------------------------------------------------------------

describe('ActorPill HP bar', () => {
  it('sets bar width to the correct percentage', () => {
    const actor = makeActor({ hp: { current: 10, max: 20 } }); // 50 %
    const { container } = render(
      ActorPill,
      defaultProps({ actor, isActive: true }),
    );
    const fill = container.querySelector('.hp-bar-fill') as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe('50%');
  });

  it('clamps width to 0% when current is 0', () => {
    const actor = makeActor({ hp: { current: 0, max: 20 } });
    const { container } = render(
      ActorPill,
      defaultProps({ actor, isActive: true }),
    );
    const fill = container.querySelector('.hp-bar-fill') as HTMLElement | null;
    expect(fill!.style.width).toBe('0%');
  });

  it('clamps width to 100% when current exceeds max', () => {
    const actor = makeActor({ hp: { current: 25, max: 20 } });
    const { container } = render(
      ActorPill,
      defaultProps({ actor, isActive: true }),
    );
    const fill = container.querySelector('.hp-bar-fill') as HTMLElement | null;
    expect(fill!.style.width).toBe('100%');
  });

  it('uses success color when HP > 50%', () => {
    const actor = makeActor({ hp: { current: 11, max: 20 } }); // 55 %
    const { container } = render(
      ActorPill,
      defaultProps({ actor, isActive: true }),
    );
    const fill = container.querySelector('.hp-bar-fill') as HTMLElement | null;
    expect(fill!.style.backgroundColor).toBe('var(--color-success)');
  });

  it('uses warning color when HP is exactly at 50%', () => {
    // 50% is NOT > 50, so it falls to the next check (> 25)
    const actor = makeActor({ hp: { current: 10, max: 20 } }); // 50 %
    const { container } = render(
      ActorPill,
      defaultProps({ actor, isActive: true }),
    );
    const fill = container.querySelector('.hp-bar-fill') as HTMLElement | null;
    expect(fill!.style.backgroundColor).toBe('var(--color-warning)');
  });

  it('uses warning color when HP is between 26% and 50%', () => {
    const actor = makeActor({ hp: { current: 6, max: 20 } }); // 30 %
    const { container } = render(
      ActorPill,
      defaultProps({ actor, isActive: true }),
    );
    const fill = container.querySelector('.hp-bar-fill') as HTMLElement | null;
    expect(fill!.style.backgroundColor).toBe('var(--color-warning)');
  });

  it('uses danger color when HP is at 25% or below', () => {
    const actor = makeActor({ hp: { current: 5, max: 20 } }); // 25 %
    const { container } = render(
      ActorPill,
      defaultProps({ actor, isActive: true }),
    );
    const fill = container.querySelector('.hp-bar-fill') as HTMLElement | null;
    expect(fill!.style.backgroundColor).toBe('var(--color-danger)');
  });

  it('uses danger color when HP is critically low', () => {
    const actor = makeActor({ hp: { current: 1, max: 20 } }); // 5 %
    const { container } = render(
      ActorPill,
      defaultProps({ actor, isActive: true }),
    );
    const fill = container.querySelector('.hp-bar-fill') as HTMLElement | null;
    expect(fill!.style.backgroundColor).toBe('var(--color-danger)');
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
