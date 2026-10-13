import { http } from './http';

interface AccessTokenResponse {
  accessToken: string;
}

export const authApi = {
  async register(email: string, password: string): Promise<string> {
    const { data } = await http.post<AccessTokenResponse>('/auth/register', { email, password });
    return data.accessToken;
  },
  async login(email: string, password: string): Promise<string> {
    const { data } = await http.post<AccessTokenResponse>('/auth/login', { email, password });
    return data.accessToken;
  },
  async refresh(): Promise<string> {
    const { data } = await http.post<AccessTokenResponse>('/auth/refresh');
    return data.accessToken;
  },
  async logout(): Promise<void> {
    await http.post('/auth/logout');
  },
};
