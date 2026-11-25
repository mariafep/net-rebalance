import { supabase } from '../lib/supabase'
import type { Profile, RiskProfileUpdateData } from '../types/profile'

const profileFields = `
  id,
  full_name,
  risk_profile,
  investment_horizon,
  risk_score,
  profile_completed_at,
  created_at,
  updated_at
`

export const profileService = {
  async getProfile(userId: string): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .select(profileFields)
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
      .select(profileFields)
      .single()

    if (error) {
      throw error
    }

    return data
  },

  async updateRiskProfile(
    userId: string,
    riskData: RiskProfileUpdateData,
  ): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        risk_profile: riskData.risk_profile,
        investment_horizon: riskData.investment_horizon,
        risk_score: riskData.risk_score,
        profile_completed_at: riskData.profile_completed_at,
      })
      .eq('id', userId)
      .select(profileFields)
      .single()

    if (error) {
      throw error
    }

    return data
  },
}
