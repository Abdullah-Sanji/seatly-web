import { createRouter, createWebHistory, Router, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/events' },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
  { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue') },
  { path: '/events', name: 'events', component: () => import('@/views/EventsView.vue') },
  {
    path: '/me/bookings',
    name: 'my-bookings',
    component: () => import('@/views/MyBookingsView.vue'),
    meta: { requiresAuth: true },
  },
];

export function installGuards(router: Router): void {
  router.beforeEach((to) => {
    if (to.meta.requiresAuth && !useAuthStore().isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
    return true;
  });
}

export const router = createRouter({ history: createWebHistory(), routes });
installGuards(router);
