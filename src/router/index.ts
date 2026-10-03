import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),

    routes: [
        {
            path: '/',
            redirect: '/dashboard',
        },

        // Rutas públicas
        {
            path: '/login',
            name: 'login',
            component: () => import('../views/auth/LoginView.vue'),
            meta: {
                requiresGuest: true,
            },
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('../views/auth/RegisterView.vue'),
            meta: {
                requiresGuest: true,
            },
        },

        // Aplicación autenticada
        {
            path: '/',
            component: () => import('../layouts/AppLayout.vue'),
            meta: {
                requiresAuth: true,
            },
            children: [
                {
                    path: 'dashboard',
                    name: 'dashboard',
                    component: () => import('../views/DashboardView.vue'),
                },
                {
                    path: 'portfolios',
                    name: 'portfolios',
                    component: () => import('../views/portfolios/PortfoliosView.vue'),
                },
                {
                    path: 'portfolios/:id/config',
                    name: 'portfolio-config',
                    component: () =>
                        import('../views/portfolios/PortfolioConfigView.vue'),
                },
                {
                    path: 'portfolios/:id/analysis',
                    name: 'portfolio-analysis',
                    component: () =>
                        import('../views/portfolios/RebalanceResultView.vue'),
                },
                {
                    path: 'brokers',
                    name: 'brokers',
                    component: () => import('../views/brokers/BrokersView.vue'),
                },
                {
                    path: 'profile',
                    name: 'profile',
                    component: () => import('../views/ProfileView.vue'),
                },
            ],
        },
    ],
})

router.beforeEach(async (to) => {
    const { user, loading, initializeAuth } = useAuth()

    if (loading.value) {
        await initializeAuth()
    }

    if (to.meta.requiresAuth && !user.value) {
        return { name: 'login' }
    }

    if (to.meta.requiresGuest && user.value) {
        return { name: 'dashboard' }
    }
})

export default router