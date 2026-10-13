import { isAxiosError } from 'axios';
import { ErrorBody } from './types';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'REQUEST_FAILED'
  | 'REFRESH_INVALID'
  | 'RATE_LIMITED'
  | 'EMAIL_TAKEN'
  | 'EVENT_NOT_FOUND'
  | 'SEAT_NOT_FOUND'
  | 'SALES_NOT_OPEN'
  | 'SEAT_SOLD'
  | 'SEAT_HELD'
  | 'HOLD_LIMIT_REACHED'
  | 'NOT_HOLDER'
  | 'NO_HELD_SEATS'
  | 'HOLD_EXPIRED'
  | 'INTERNAL'
  | 'NETWORK';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function isErrorBody(data: unknown): data is ErrorBody {
  return typeof data === 'object' && data !== null && typeof (data as ErrorBody).code === 'string';
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (error.response && isErrorBody(data)) {
      return new ApiError(error.response.status, data.code as ErrorCode, data.message, data.details ?? {});
    }
    if (!error.response) {
      return new ApiError(0, 'NETWORK', 'Cannot reach the server', {});
    }
    return new ApiError(error.response.status, 'REQUEST_FAILED', error.message, {});
  }
  return new ApiError(500, 'INTERNAL', error instanceof Error ? error.message : 'Unexpected error', {});
}
