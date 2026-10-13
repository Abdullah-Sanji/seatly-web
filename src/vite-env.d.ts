/// <reference types="vite/client" />

interface SeatlyRuntimeConfig {
  apiUrl?: string;
}

declare global {
  interface Window {
    __SEATLY_CONFIG__?: SeatlyRuntimeConfig;
  }
}

export {};
