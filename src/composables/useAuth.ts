import { ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { authService } from '../services/auth.service'

const user = ref<User | null>(null)
const loading = ref(true)
let initialized = false

export function useAuth() {
    async function initializeAuth() {
        if (initialized) return

        initialized = true
        loading.value = true

        try {
            const session = await authService.getSession()
            user.value = session?.user ?? null

            supabase.auth.onAuthStateChange((_event, session) => {
                user.value = session?.user ?? null
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
    }

    return {
        user,
        loading,
        initializeAuth,
        login,
        register,
        logout,
    }
}