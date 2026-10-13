import { AxiosError, AxiosHeaders } from 'axios';
import { ApiError, isApiError, toApiError } from './errors';

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
  error.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

describe('toApiError', () => {
  it('maps the API envelope to an ApiError', () => {
    const err = toApiError(
      axiosErrorWith(409, { statusCode: 409, code: 'SEAT_HELD', message: 'Seat is held', details: {} }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('SEAT_HELD');
    expect(err.message).toBe('Seat is held');
  });

  it('keeps details such as lostSeatIds', () => {
    const err = toApiError(
      axiosErrorWith(409, { statusCode: 409, code: 'HOLD_EXPIRED', message: 'x', details: { lostSeatIds: ['s1'] } }),
    );
    expect(err.details).toEqual({ lostSeatIds: ['s1'] });
  });

  it('maps a missing response to NETWORK', () => {
    const err = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'));
    expect(err.code).toBe('NETWORK');
    expect(err.status).toBe(0);
  });

  it('passes an ApiError through and wraps unknown errors as INTERNAL', () => {
    const original = new ApiError(500, 'INTERNAL', 'boom', {});
    expect(toApiError(original)).toBe(original);
    expect(toApiError(new Error('x')).code).toBe('INTERNAL');
    expect(isApiError(original)).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});
