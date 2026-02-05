/**
 * API layer for HearthVTT client.
 *
 * This module provides HTTP and WebSocket communication with the server.
 *
 * Responsibilities:
 * - HTTP client wrapper for REST API calls
 * - WebSocket client for realtime updates
 * - Action dispatch helpers
 *
 * Usage:
 * - Import specific clients as needed
 * - All network communication goes through this layer
 */

// HTTP API client
export { api, Api, ApiError } from './http';
export type {
  AuthApi,
  CampaignApi,
  SeatApi,
  InviteApi,
  SessionApi,
} from './http';

// WebSocket client
export { wsClient, WebSocketClient } from './ws';
