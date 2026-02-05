/**
 * Event log state management using Svelte 5 runes.
 * 
 * This module holds recent GameEvents from the server for display in the
 * chat log. Events are filtered by Audience on the server side.
 */

/**
 * Event log store.
 * 
 * Maintains an ordered list of recent GameEvents for chat display.
 * Updated by event.new messages from the WebSocket.
 */
class EventLogState {
  events = $state<unknown[]>([]);
  maxEvents = $state<number>(200); // Configurable

  /**
   * Append a new event to the log.
   */
  appendEvent(event: unknown) {
    this.events.push(event);
    
    // Trim to max size
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Append multiple events (e.g., on initial sync or reconnect).
   */
  appendEvents(events: unknown[]) {
    this.events.push(...events);
    
    // Trim to max size
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Clear all events (e.g., on campaign switch or logout).
   */
  clear() {
    this.events = [];
  }

  /**
   * Set the maximum number of events to retain.
   */
  setMaxEvents(max: number) {
    this.maxEvents = max;
    
    // Trim if necessary
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }
}

/**
 * Singleton event log state instance.
 */
export const eventLogState = new EventLogState();
