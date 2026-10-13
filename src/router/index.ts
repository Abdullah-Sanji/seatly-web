import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/events' },
  { path: '/events', name: 'events', component: () => import('@/views/EventsView.vue') },
];

export const router = createRouter({ history: createWebHistory(), routes });
