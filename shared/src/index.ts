// @hearth-vtt/shared — public API barrel
// Exports are added here as modules are implemented.

export { seatRoleSchema, type SeatRole } from './seat';
export {
  serverMessageSchema,
  type ServerMessage,
  clientMessageSchema,
  type ClientMessage,
} from './protocol/ws';
