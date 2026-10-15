import { isAxiosError } from 'axios';
import { ApiErrorCode, ErrorBody } from './types';

/** Codes the API can return (from the contract) plus the client-only NETWORK code. */
export type ErrorCode = ApiErrorCode | 'NETWORK';

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
