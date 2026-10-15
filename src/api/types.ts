/**
 * API types are generated from the backend contract (seatly-api/contracts/openapi.yaml)
 * by `pnpm api:types`. Do not hand-edit shapes here: change the contract, regenerate.
 * This module only gives the generated schemas their familiar names.
 */
import type { components } from './generated/openapi';

type Schemas = components['schemas'];

export type EventStatus = Schemas['EventStatus'];
export type SeatState = Schemas['SeatState'];
export type SeatView = Schemas['SeatView'];
export type EventSummary = Schemas['EventSummary'];
export type EventDetail = Schemas['EventDetail'];
export type HoldResponse = Schemas['HoldResponse'];
export type BookingResult = Schemas['BookingResult'];
export type MyBooking = Schemas['MyBooking'];
export type SeatUpdateMessage = Schemas['SeatUpdateMessage'];
export type SalesOpenedMessage = Schemas['SalesOpenedMessage'];
export type ErrorBody = Schemas['ErrorBody'];
export type ApiErrorCode = Schemas['ErrorCode'];
