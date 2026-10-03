import { supabase } from '../lib/supabase'
import type { Profile } from '../types/profile'

export const profileService = {
    async getProfile(userId: string): Promise<Profile> {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, created_at, updated_at')
            .eq('id', userId)
            .single()

        if (error) {
            throw error
        }

        return data
    },

    async updateProfile(
        userId: string,
        fullName: string,
    ): Promise<Profile> {
        const { data, error } = await supabase
            .from('profiles')
            .update({
                full_name: fullName,
            })
            .eq('id', userId)
            .select('id, full_name, created_at, updated_at')
            .single()

        if (error) {
            throw error
        }

        return data
    },
}