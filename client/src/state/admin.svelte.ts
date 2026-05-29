/**
 * Admin state management using Svelte 5 runes.
 *
 * Manages:
 * - Admin authentication (CSRF token)
 * - Tree navigation state (which nodes are expanded, which node is selected)
 * - Mock data for campaigns, seats, and accounts
 *
 * Tree structure:
 *   ⚙ Settings   (leaf)
 *   📁 Campaigns  (expandable)
 *     └ 📁 Campaign  (expandable)
 *       └ 👤 Seat    (leaf)
 *   👥 Accounts  (expandable)
 *     └ 👤 Account  (leaf)
 *
 * All navigation happens via `adminTree.navigateTo(id, type)` so cross-links
 * between branches (e.g. "Go to account" from a seat panel) work correctly.
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';

// ============================================================================
// Types
// ============================================================================

export type NodeType = 'settings' | 'campaign' | 'seat' | 'account';

export interface AdminTreeNode {
  id: string;
  type: NodeType;
  label: string;
  /** Child node IDs (undefined for leaves). */
  children?: string[];
  /** Parent node ID (undefined for root nodes). */
  parentId?: string;
}

// ============================================================================
// Mock data
// ============================================================================
// TODO (Phase 5+): Replace with real API calls. Server endpoints already exist:
//   GET    /api/admin/accounts          — list all player accounts
//   POST   /api/admin/accounts/:id/reset-password
//   POST   /api/admin/accounts/:id/revoke-sessions
//   GET    /api/admin/campaigns         — list campaigns (already wired)
//   GET    /api/admin/campaigns/:id/seats
//   POST   /api/admin/campaigns/:id/seats
//   POST   /api/admin/invites (per seat)
//   DELETE /api/admin/invites/:token

export interface MockCampaign {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockSeat {
  id: string;
  campaignId: string;
  displayName: string;
  role: 'gm' | 'player' | 'spectator';
  isActive: boolean;
  createdAt: string;
  /** accountId of the account that claimed this seat, if any. */
  claimedByAccountId?: string;
}

export interface MockInvite {
  id: string;
  seatId: string;
  inviteToken: string;
  inviteUrl: string;
  maxUses: number;
  usesRemaining: number;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface MockAccount {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  /** Seat IDs claimed by this account. */
  seatIds: string[];
}

const MOCK_CAMPAIGNS: MockCampaign[] = [
  {
    id: 'campaign-mock-001',
    name: 'The Sundered Crown',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-02-01T14:30:00Z',
  },
  {
    id: 'campaign-mock-002',
    name: 'Curse of Strahd',
    createdAt: '2026-01-20T09:00:00Z',
    updatedAt: '2026-02-03T16:45:00Z',
  },
];

const MOCK_SEATS: MockSeat[] = [
  {
    id: 'seat-gm-001',
    campaignId: 'campaign-mock-001',
    displayName: 'GM',
    role: 'gm',
    isActive: true,
    createdAt: '2026-01-15T10:05:00Z',
  },
  {
    id: 'seat-player-001',
    campaignId: 'campaign-mock-001',
    displayName: 'Player 1',
    role: 'player',
    isActive: true,
    createdAt: '2026-01-15T10:10:00Z',
    claimedByAccountId: 'account-001',
  },
  {
    id: 'seat-player-002',
    campaignId: 'campaign-mock-001',
    displayName: 'Player 2',
    role: 'player',
    isActive: true,
    createdAt: '2026-01-16T09:00:00Z',
    claimedByAccountId: 'account-002',
  },
  {
    id: 'seat-gm-002',
    campaignId: 'campaign-mock-002',
    displayName: 'GM',
    role: 'gm',
    isActive: true,
    createdAt: '2026-01-20T09:05:00Z',
  },
  {
    id: 'seat-player-003',
    campaignId: 'campaign-mock-002',
    displayName: 'Player 1',
    role: 'player',
    isActive: false,
    createdAt: '2026-01-21T11:00:00Z',
  },
];

const MOCK_INVITES: MockInvite[] = [
  {
    id: 'invite-001',
    seatId: 'seat-player-001',
    inviteToken: 'ABC123XYZ',
    inviteUrl: 'http://localhost:3000/join/ABC123XYZ',
    maxUses: 1,
    usesRemaining: 0,
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    createdAt: '2026-02-01T10:00:00Z',
    revokedAt: null,
  },
  {
    id: 'invite-002',
    seatId: 'seat-player-002',
    inviteToken: 'DEF456UVW',
    inviteUrl: 'http://localhost:3000/join/DEF456UVW',
    maxUses: 1,
    usesRemaining: 1,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: '2026-02-05T10:00:00Z',
    revokedAt: null,
  },
];

const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: 'account-001',
    username: 'kael_player',
    createdAt: '2026-01-15T11:00:00Z',
    lastLoginAt: '2026-05-28T14:22:00Z',
    mustChangePassword: false,
    seatIds: ['seat-player-001'],
  },
  {
    id: 'account-002',
    username: 'lyra_wizard',
    createdAt: '2026-01-16T09:30:00Z',
    lastLoginAt: '2026-05-27T18:45:00Z',
    mustChangePassword: false,
    seatIds: ['seat-player-002'],
  },
];

// ============================================================================
// Admin auth state
// ============================================================================

/**
 * Admin auth state store.
 *
 * Manages CSRF token for all state-changing admin requests.
 * Not persisted across page reloads (token retrieved from server on login/setup).
 */
class AdminAuthState {
  csrfToken = $state<string | null>(null);

  setCsrfToken(token: string) {
    this.csrfToken = token;
  }

  clearCsrfToken() {
    this.csrfToken = null;
  }

  getCsrfToken(): string | null {
    return this.csrfToken;
  }
}

export const adminAuth = new AdminAuthState();

// ============================================================================
// Admin tree navigation state
// ============================================================================

/**
 * Builds a flat node map and root-node list from mock data.
 *
 * Tree shape:
 *   settings  (root leaf)
 *   campaigns (root branch) → campaigns → seats
 *   accounts  (root branch) → accounts
 */
function buildInitialTree(): {
  nodes: Map<string, AdminTreeNode>;
  rootIds: string[];
} {
  const nodes = new SvelteMap<string, AdminTreeNode>();

  // Root nodes
  nodes.set('settings', {
    id: 'settings',
    type: 'settings',
    label: '⚙ Settings',
  });

  nodes.set('campaigns', {
    id: 'campaigns',
    type: 'campaign',
    label: '📁 Campaigns',
    children: MOCK_CAMPAIGNS.map((c) => c.id),
  });

  nodes.set('accounts', {
    id: 'accounts',
    type: 'account',
    label: '👥 Accounts',
    children: MOCK_ACCOUNTS.map((a) => a.id),
  });

  // Campaign nodes
  for (const c of MOCK_CAMPAIGNS) {
    const seatIds = MOCK_SEATS.filter((s) => s.campaignId === c.id).map(
      (s) => s.id,
    );
    nodes.set(c.id, {
      id: c.id,
      type: 'campaign',
      label: c.name,
      children: seatIds.length > 0 ? seatIds : undefined,
      parentId: 'campaigns',
    });
  }

  // Seat nodes
  for (const s of MOCK_SEATS) {
    nodes.set(s.id, {
      id: s.id,
      type: 'seat',
      label: `${s.role === 'gm' ? '👑' : '👤'} ${s.displayName}`,
      parentId: s.campaignId,
    });
  }

  // Account nodes
  for (const a of MOCK_ACCOUNTS) {
    nodes.set(a.id, {
      id: a.id,
      type: 'account',
      label: a.username,
      parentId: 'accounts',
    });
  }

  return { nodes, rootIds: ['settings', 'campaigns', 'accounts'] };
}

/**
 * Admin tree navigation state.
 *
 * Owns the expanded/collapsed state of all tree nodes and the currently
 * selected node. All navigation (including cross-branch links) goes through
 * `navigateTo()` so the tree always reflects the displayed panel.
 */
class AdminTreeState {
  private nodes: Map<string, AdminTreeNode>;
  readonly rootIds: string[];

  /** Set of expanded node IDs. */
  expandedIds = $state<Set<string>>(new Set(['settings']));

  /** Currently selected node ID. Default: 'settings'. */
  selectedId = $state<string>('settings');

  /** Auxiliary: campaigns data (mutable for name-edit mock). */
  campaigns = $state<MockCampaign[]>(MOCK_CAMPAIGNS.map((c) => ({ ...c })));

  /** Auxiliary: seats data. */
  seats = $state<MockSeat[]>(MOCK_SEATS.map((s) => ({ ...s })));

  /** Auxiliary: invites data. */
  invites = $state<MockInvite[]>(MOCK_INVITES.map((i) => ({ ...i })));

  /** Auxiliary: accounts data. */
  accounts = $state<MockAccount[]>(MOCK_ACCOUNTS.map((a) => ({ ...a })));

  constructor() {
    const { nodes, rootIds } = buildInitialTree();
    this.nodes = nodes;
    this.rootIds = rootIds;
  }

  // --------------------------------------------------------------------------
  // Node access
  // --------------------------------------------------------------------------

  getNode(id: string): AdminTreeNode | undefined {
    return this.nodes.get(id);
  }

  /** Returns true if a node has children AND is expanded. */
  isExpanded(id: string): boolean {
    return this.expandedIds.has(id);
  }

  /** Returns true if this is the currently selected node. */
  isSelected(id: string): boolean {
    return this.selectedId === id;
  }

  // --------------------------------------------------------------------------
  // Navigation
  // --------------------------------------------------------------------------

  /**
   * Toggle expanded state of a branch node.
   * Leaves (no children) are silently ignored.
   */
  toggleExpanded(id: string): void {
    const node = this.nodes.get(id);
    if (!node?.children?.length) return;
    const next = new SvelteSet(this.expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedIds = next;
  }

  /**
   * Select a node and ensure all ancestors are expanded so it is visible.
   * This is the single entry-point for all navigation, including cross-links.
   */
  navigateTo(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Expand every ancestor up to (but not including) the root virtual nodes
    const ancestors: string[] = [];
    let current = node.parentId ? this.nodes.get(node.parentId) : undefined;
    while (current) {
      ancestors.push(current.id);
      current = current.parentId ? this.nodes.get(current.parentId) : undefined;
    }

    if (ancestors.length > 0) {
      const next = new SvelteSet(this.expandedIds);
      for (const a of ancestors) next.add(a);
      this.expandedIds = next;
    }

    this.selectedId = id;
  }

  // --------------------------------------------------------------------------
  // Data lookups (derived helpers used by detail panels)
  // --------------------------------------------------------------------------

  getCampaign(id: string): MockCampaign | undefined {
    return this.campaigns.find((c) => c.id === id);
  }

  getSeatsForCampaign(campaignId: string): MockSeat[] {
    return this.seats.filter((s) => s.campaignId === campaignId);
  }

  getSeat(id: string): MockSeat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  getInvitesForSeat(seatId: string): MockInvite[] {
    return this.invites.filter((i) => i.seatId === seatId);
  }

  getAccount(id: string): MockAccount | undefined {
    return this.accounts.find((a) => a.id === id);
  }

  getAccountForSeat(seatId: string): MockAccount | undefined {
    return this.accounts.find((a) => a.seatIds.includes(seatId));
  }

  getSeatsForAccount(accountId: string): MockSeat[] {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) return [];
    return this.seats.filter((s) => account.seatIds.includes(s.id));
  }

  getCampaignForSeat(seatId: string): MockCampaign | undefined {
    const seat = this.getSeat(seatId);
    if (!seat) return undefined;
    return this.getCampaign(seat.campaignId);
  }

  // --------------------------------------------------------------------------
  // Derived: selected node type for panel routing
  // --------------------------------------------------------------------------

  get selectedNodeType(): NodeType | null {
    return this.nodes.get(this.selectedId)?.type ?? null;
  }
}

export const adminTree = new AdminTreeState();

/**
 * Admin fetch helper that automatically includes CSRF token.
 *
 * Use this for all state-changing admin API requests (POST, PUT, PATCH, DELETE).
 * GET requests don't need CSRF protection and can use regular fetch.
 *
 * @param url - API endpoint URL
 * @param options - Fetch options (will merge in CSRF header)
 * @returns Fetch response
 *
 * @example
 * const response = await adminFetch('/api/admin/logout', { method: 'POST' });
 */
export async function adminFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const csrfToken = adminAuth.getCsrfToken();

  // Add CSRF token to headers if available
  const headers = new Headers(options.headers || {});
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  // Merge headers and credentials
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Always include cookies for admin requests
  };

  return fetch(url, fetchOptions);
}
