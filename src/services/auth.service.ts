import { supabase } from '../lib/supabase'

export const authService = {
    async login(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            throw error
        }

        return data
    },

    async register(fullName: string, email: string, password: string) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                },
            },
        })

        if (error) {
            throw error
        }

        return data
    },

    async logout() {
        const { error } = await supabase.auth.signOut()

        if (error) {
            throw error
        }
    },

    async getSession() {
        const { data, error } = await supabase.auth.getSession()

        if (error) {
            throw error
        }

        return data.session
    },
}