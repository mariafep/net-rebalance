import { ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { authService } from '../services/auth.service'

const user = ref<User | null>(null)
const loading = ref(true)
const isRecoveryMode = ref(false)
let initialized = false

export function useAuth() {
    async function initializeAuth() {
        if (initialized) return

        initialized = true
        loading.value = true

        if (
            typeof window !== 'undefined' &&
            (window.location.hash.includes('type=recovery') ||
                window.location.search.includes('type=recovery'))
        ) {
            isRecoveryMode.value = true
        }

        try {
            const session = await authService.getSession()
            user.value = session?.user ?? null

            supabase.auth.onAuthStateChange((event, session) => {
                user.value = session?.user ?? null

                if (event === 'PASSWORD_RECOVERY') {
                    isRecoveryMode.value = true
                }
            })
        } catch (error) {
            console.error('Error al inicializar la sesión:', error)
            user.value = null
        } finally {
            loading.value = false
        }
    }

    async function login(email: string, password: string) {
        const data = await authService.login(email, password)
        user.value = data.user
        return data
    }

    async function register(
        fullName: string,
        email: string,
        password: string,
    ) {
        const data = await authService.register(fullName, email, password)
        user.value = data.session?.user ?? null
        return data
    }

    async function logout() {
        await authService.logout()
        user.value = null
        isRecoveryMode.value = false
    }

    async function requestPasswordReset(email: string) {
        await authService.requestPasswordReset(email)
    }

    async function updatePassword(newPassword: string) {
        const data = await authService.updatePassword(newPassword)
        user.value = data.user
        isRecoveryMode.value = false
        return data
    }

    function clearRecoveryMode() {
        isRecoveryMode.value = false
    }

    return {
        user,
        loading,
        isRecoveryMode,
        initializeAuth,
        login,
        register,
        logout,
        requestPasswordReset,
        updatePassword,
        clearRecoveryMode,
    }
}
