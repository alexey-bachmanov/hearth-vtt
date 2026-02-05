<script lang="ts">
/**
 * SessionAudit - List active sessions and revoke them.
 * 
 * Shows all active sessions with ability to force logout.
 */

// Mock session data - TODO: Wire to GET /api/sessions
const sessions = [
  {
    id: 'sess-1',
    seatName: 'GM Seat',
    ipAddress: '192.168.1.100',
    userAgent: 'Chrome 120.0',
    lastActivity: '2026-02-05 14:23',
    isCurrentSession: true,
  },
  {
    id: 'sess-2',
    seatName: 'Player 1',
    ipAddress: '192.168.1.101',
    userAgent: 'Firefox 121.0',
    lastActivity: '2026-02-05 14:20',
    isCurrentSession: false,
  },
  {
    id: 'sess-3',
    seatName: 'Player 2',
    ipAddress: '192.168.1.102',
    userAgent: 'Safari 17.0',
    lastActivity: '2026-02-05 13:45',
    isCurrentSession: false,
  },
];

function handleRevoke(sessionId: string) {
  console.log('Revoke session:', sessionId);
  // TODO: Call DELETE /api/sessions/:id
}
</script>

<div class="session-audit">
  <div class="page-header">
    <h1>Active Sessions</h1>
  </div>

  <div class="sessions-table">
    <div class="table-header">
      <span>Seat</span>
      <span>IP Address</span>
      <span>User Agent</span>
      <span>Last Activity</span>
      <span>Actions</span>
    </div>
    {#each sessions as session (session.id)}
      <div class="table-row" class:current={session.isCurrentSession}>
        <span class="seat-name">
          {session.seatName}
          {#if session.isCurrentSession}
            <span class="current-badge">You</span>
          {/if}
        </span>
        <span class="session-ip">{session.ipAddress}</span>
        <span class="session-ua">{session.userAgent}</span>
        <span class="session-activity">{session.lastActivity}</span>
        <div class="session-actions">
          {#if !session.isCurrentSession}
            <button class="action-button danger" onclick={() => handleRevoke(session.id)}>
              Revoke
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .session-audit {
    max-width: 1200px;
  }

  .page-header {
    margin-bottom: var(--space-xl);
  }

  .page-header h1 {
    margin: 0;
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .sessions-table {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1.5fr 1.5fr 1fr;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background-color: var(--color-bg-tertiary);
    border-bottom: 1px solid var(--color-border-default);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
  }

  .table-row {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1.5fr 1.5fr 1fr;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border-subtle);
    align-items: center;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .table-row.current {
    background-color: var(--color-bg-elevated);
  }

  .seat-name {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .current-badge {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-accent-primary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: white;
  }

  .session-ip,
  .session-ua,
  .session-activity {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .session-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-button {
    padding: var(--space-xs) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-button.danger {
    color: var(--color-danger);
  }

  .action-button.danger:hover {
    background-color: var(--color-danger);
    border-color: var(--color-danger);
    color: white;
  }
</style>
