/**
 * Admin state management using Svelte 5 runes.
 *
 * Manages:
 * - Admin authentication (CSRF token) with page-reload re-hydration
 * - Tree navigation state (which nodes are expanded, which node is selected)
 * - Live campaign, seat, invite, and account data loaded from the server
 * - Mutation methods for all admin operations
 *
 * Tree structure:
 *   ⚙ Settings   (leaf)
 *   📁 Campaigns  (expandable)
 *     └ 📁 Campaign  (expandable)
 *       └ 👤 Seat    (leaf)
 *   👥 Accounts  (expandable)
 *     └ 👤 Account  (leaf)
 *
 * All navigation happens via `adminTree.navigateTo(id)` so cross-links
 * between branches (e.g. "Go to account" from a seat panel) work correctly.
 *
 * Usage on mount:
 *   const ok = await adminAuth.hydrateFromCheckAuth();
 *   if (!ok) { navigate('/admin/login'); return; }
 *   await adminTree.load();
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type {
  AdminAccountSummary,
  AdminResetPasswordRequest,
} from '@hearth-vtt/shared';
import type { SeatRole } from '@hearth-vtt/shared';
import {
  api,
  type AdminCampaign,
  type AdminSeat,
  type AdminInvite,
} from '../api/http.js';

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

/** Invite with a client-computed `inviteUrl` (server list endpoint omits this field). */
export type AdminInviteWithUrl = AdminInvite & { inviteUrl: string };

// Re-export API types for UI components.
export type { AdminCampaign, AdminSeat, AdminAccountSummary };

// ============================================================================
// Admin auth state
// ============================================================================

/**
 * Admin auth state store.
 *
 * Manages the CSRF token for all state-changing admin requests.
 * The token is not persisted across page reloads; call hydrateFromCheckAuth()
 * on mount to re-acquire it from the server.
 */
class AdminAuthState {
  csrfToken = $state<string | null>(null);

  setCsrfToken(token: string): void {
    this.csrfToken = token;
  }

  clearCsrfToken(): void {
    this.csrfToken = null;
  }

  getCsrfToken(): string | null {
    return this.csrfToken;
  }

  /**
   * Call GET /api/admin/check-auth and re-hydrate the CSRF token if the admin
   * session is still valid. Used on page load to restore admin state after a
   * browser reload without a full login cycle.
   *
   * @returns true when authenticated, false otherwise.
   */
  async hydrateFromCheckAuth(): Promise<boolean> {
    const res = await api.adminAuth.checkAuth();
    if (res.authenticated && res.csrfToken) {
      this.setCsrfToken(res.csrfToken);
      return true;
    }
    return false;
  }
}

export const adminAuth = new AdminAuthState();

// ============================================================================
// Admin tree navigation + data state
// ============================================================================

class AdminTreeState {
  // ---------------------------------------------------------------------------
  // Private: flat node map (rebuilt from data arrays by _rebuildTree()).
  // $state on the reference so reference reassignment notifies reactive consumers.
  // ---------------------------------------------------------------------------
  private nodes = $state<SvelteMap<string, AdminTreeNode>>(new SvelteMap());

  readonly rootIds: string[] = ['settings', 'campaigns', 'accounts'];

  // ---------------------------------------------------------------------------
  // Navigation state
  // ---------------------------------------------------------------------------

  /** Set of currently expanded node IDs. */
  expandedIds = $state<Set<string>>(new Set(['settings']));

  /** Currently selected node ID. */
  selectedId = $state<string>('settings');

  // ---------------------------------------------------------------------------
  // Data arrays — populated by load(); kept in sync by mutation methods.
  // ---------------------------------------------------------------------------

  campaigns = $state<AdminCampaign[]>([]);
  seats = $state<AdminSeat[]>([]);
  invites = $state<AdminInviteWithUrl[]>([]);
  accounts = $state<AdminAccountSummary[]>([]);

  // ---------------------------------------------------------------------------
  // Load state
  // ---------------------------------------------------------------------------

  loading = $state(false);
  error = $state<string | null>(null);

  constructor() {
    // Initialise the tree with empty data arrays so root nodes are visible
    // immediately; real data fills in after load() completes.
    this._rebuildTree();
  }

  // --------------------------------------------------------------------------
  // Node access
  // --------------------------------------------------------------------------

  getNode(id: string): AdminTreeNode | undefined {
    return this.nodes.get(id);
  }

  /** Returns true if a node has children AND is currently expanded. */
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

  getCampaign(id: string): AdminCampaign | undefined {
    return this.campaigns.find((c) => c.id === id);
  }

  getSeatsForCampaign(campaignId: string): AdminSeat[] {
    return this.seats.filter((s) => s.campaignId === campaignId);
  }

  getSeat(id: string): AdminSeat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  getInvitesForSeat(seatId: string): AdminInviteWithUrl[] {
    return this.invites.filter((i) => i.seatId === seatId);
  }

  getAccount(id: string): AdminAccountSummary | undefined {
    return this.accounts.find((a) => a.id === id);
  }

  getAccountForSeat(seatId: string): AdminAccountSummary | undefined {
    return this.accounts.find((a) => a.seatIds.includes(seatId));
  }

  getSeatsForAccount(accountId: string): AdminSeat[] {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) return [];
    return this.seats.filter((s) => account.seatIds.includes(s.id));
  }

  getCampaignForSeat(seatId: string): AdminCampaign | undefined {
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

  // --------------------------------------------------------------------------
  // Load
  // --------------------------------------------------------------------------

  /**
   * Load all admin data from the server.
   *
   * Fetches campaigns + accounts in parallel, then fetches seats + invites per
   * campaign (also in parallel). Populates all data arrays and rebuilds the tree.
   */
  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [campaignsRes, accountsRes] = await Promise.all([
        api.adminCampaigns.list(),
        api.adminAccounts.list(),
      ]);
      this.campaigns = campaignsRes.campaigns;
      this.accounts = accountsRes.accounts;

      const [seatResults, inviteResults] = await Promise.all([
        Promise.all(
          this.campaigns.map((c) => api.adminSeats.listForCampaign(c.id)),
        ),
        Promise.all(
          this.campaigns.map((c) => api.adminInvites.listForCampaign(c.id)),
        ),
      ]);

      this.seats = seatResults.flatMap((r) => r.seats);
      this.invites = inviteResults
        .flatMap((r) => r.invites)
        .map((inv) => ({
          ...inv,
          inviteUrl: `${window.location.origin}/join/${inv.inviteToken}`,
        }));

      this._rebuildTree();
    } catch (err) {
      this.error =
        err instanceof Error ? err.message : 'Failed to load admin data';
    } finally {
      this.loading = false;
    }
  }

  // --------------------------------------------------------------------------
  // Mutations — campaigns
  // --------------------------------------------------------------------------

  async createCampaign(name: string): Promise<void> {
    await api.adminCampaigns.create({ name });
    const res = await api.adminCampaigns.list();
    this.campaigns = res.campaigns;
    this._rebuildTree();
  }

  async renameCampaign(id: string, name: string): Promise<void> {
    await api.adminCampaigns.rename(id, name);
    const res = await api.adminCampaigns.list();
    this.campaigns = res.campaigns;
    this._rebuildTree();
  }

  async deleteCampaign(id: string): Promise<void> {
    await api.adminCampaigns.delete(id);
    // Capture deleted seat IDs before removing them so we can prune invites.
    const deletedSeatIds = new Set(
      this.seats.filter((s) => s.campaignId === id).map((s) => s.id),
    );
    this.campaigns = this.campaigns.filter((c) => c.id !== id);
    this.seats = this.seats.filter((s) => s.campaignId !== id);
    this.invites = this.invites.filter(
      (inv) => !deletedSeatIds.has(inv.seatId),
    );
    this._rebuildTree();
  }

  // --------------------------------------------------------------------------
  // Mutations — seats
  // --------------------------------------------------------------------------

  async createSeat(
    campaignId: string,
    body: { displayName: string; role: SeatRole },
  ): Promise<void> {
    await api.adminSeats.create(campaignId, body);
    await this._refreshCampaignSlice(campaignId);
    this._rebuildTree();
  }

  async updateSeat(
    campaignId: string,
    seatId: string,
    patch: { displayName?: string; role?: SeatRole; isActive?: boolean },
  ): Promise<void> {
    await api.adminSeats.update(campaignId, seatId, patch);
    await this._refreshCampaignSlice(campaignId);
    this._rebuildTree();
  }

  async deleteSeat(campaignId: string, seatId: string): Promise<void> {
    await api.adminSeats.delete(campaignId, seatId);
    await this._refreshCampaignSlice(campaignId);
    this._rebuildTree();
  }

  // --------------------------------------------------------------------------
  // Mutations — invites
  // --------------------------------------------------------------------------

  async createInvite(
    campaignId: string,
    body: { seatId: string; pin: string; expiresIn: number; maxUses?: number },
  ): Promise<{
    invite: {
      id: string;
      inviteToken: string;
      inviteUrl: string;
      expiresAt: string;
    };
  }> {
    const res = await api.adminInvites.create(campaignId, body);
    await this._refreshCampaignSlice(campaignId);
    return res;
  }

  async revokeInvite(campaignId: string, inviteToken: string): Promise<void> {
    await api.adminInvites.revoke(campaignId, inviteToken);
    await this._refreshCampaignSlice(campaignId);
  }

  // --------------------------------------------------------------------------
  // Mutations — accounts
  // --------------------------------------------------------------------------

  async resetPassword(
    accountId: string,
    temporaryPassword: string,
  ): Promise<void> {
    const body: AdminResetPasswordRequest = { temporaryPassword };
    await api.adminAccounts.resetPassword(accountId, body);
  }

  async revokeSessions(accountId: string): Promise<void> {
    await api.adminAccounts.revokeSessions(accountId);
  }

  /**
   * Delete a player account.
   *
   * Currently backed by a 501 stub. Propagates ApiError(NOT_IMPLEMENTED) so
   * the caller can surface a visible inline error rather than crashing.
   */
  async deleteAccount(accountId: string): Promise<void> {
    await api.adminAccounts.delete(accountId);
  }

  /**
   * Disconnect a seat from a player account.
   *
   * Currently backed by a 501 stub. Propagates ApiError(NOT_IMPLEMENTED) so
   * the caller can surface a visible inline error rather than crashing.
   */
  async disconnectSeat(accountId: string, seatId: string): Promise<void> {
    await api.adminAccounts.disconnectSeat(accountId, seatId);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Rebuild the flat node map from current data arrays.
   *
   * Assigns a new Map to `this.nodes` (a `$state` field) so reactive consumers
   * re-render. Also prunes stale IDs from `expandedIds` and resets `selectedId`
   * to 'settings' if the currently selected node no longer exists.
   */
  private _rebuildTree(): void {
    const nodes = new SvelteMap<string, AdminTreeNode>();

    nodes.set('settings', {
      id: 'settings',
      type: 'settings',
      label: '⚙ Settings',
    });

    nodes.set('campaigns', {
      id: 'campaigns',
      type: 'campaign',
      label: '📁 Campaigns',
      children: this.campaigns.map((c) => c.id),
    });

    nodes.set('accounts', {
      id: 'accounts',
      type: 'account',
      label: '👥 Accounts',
      children: this.accounts.map((a) => a.id),
    });

    for (const c of this.campaigns) {
      const seatIds = this.seats
        .filter((s) => s.campaignId === c.id)
        .map((s) => s.id);
      nodes.set(c.id, {
        id: c.id,
        type: 'campaign',
        label: c.name,
        children: seatIds.length > 0 ? seatIds : undefined,
        parentId: 'campaigns',
      });
    }

    for (const s of this.seats) {
      nodes.set(s.id, {
        id: s.id,
        type: 'seat',
        label: `${s.role === 'gm' ? '👑' : '👤'} ${s.displayName}`,
        parentId: s.campaignId,
      });
    }

    for (const a of this.accounts) {
      nodes.set(a.id, {
        id: a.id,
        type: 'account',
        label: a.username,
        parentId: 'accounts',
      });
    }

    this.nodes = nodes;

    // Prune stale expanded IDs
    const validIds = new Set(nodes.keys());
    const nextExpanded = new SvelteSet<string>();
    for (const id of this.expandedIds) {
      if (validIds.has(id)) nextExpanded.add(id);
    }
    this.expandedIds = nextExpanded;

    // Reset selection if the selected node no longer exists
    if (!nodes.has(this.selectedId)) {
      this.selectedId = 'settings';
    }
  }

  /**
   * Refresh seats and invites for a single campaign from the server.
   *
   * Captures old seat IDs before the fetch so invites for deleted seats are
   * correctly removed (their IDs won't appear in the fresh seat list).
   */
  private async _refreshCampaignSlice(campaignId: string): Promise<void> {
    const oldSeatIds = new Set(
      this.seats.filter((s) => s.campaignId === campaignId).map((s) => s.id),
    );

    const [seatsRes, invitesRes] = await Promise.all([
      api.adminSeats.listForCampaign(campaignId),
      api.adminInvites.listForCampaign(campaignId),
    ]);

    this.seats = [
      ...this.seats.filter((s) => s.campaignId !== campaignId),
      ...seatsRes.seats,
    ];

    this.invites = [
      ...this.invites.filter((i) => !oldSeatIds.has(i.seatId)),
      ...invitesRes.invites.map((inv) => ({
        ...inv,
        inviteUrl: `${window.location.origin}/join/${inv.inviteToken}`,
      })),
    ];
  }
}

export const adminTree = new AdminTreeState();

// Wire the admin CSRF token into the API client at module initialisation time.
// This is the only place where admin.svelte.ts → api/http.ts dependency is
// established; the api layer does not import admin.svelte.ts.
api.setAdminCsrfGetter(() => adminAuth.getCsrfToken());

/**
 * Admin fetch helper for direct HTTP calls not yet migrated to the api layer.
 *
 * Automatically injects the CSRF token header and includes credentials.
 *
 * @deprecated Prefer api.admin* methods for new code.
 */
export async function adminFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const csrfToken = adminAuth.getCsrfToken();
  const headers = new Headers(options.headers ?? {});
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}
