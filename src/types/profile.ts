export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'

export interface Profile {
  id: string
  full_name: string
  risk_profile: RiskProfile | null
  investment_horizon: string | null
  risk_score: number | null
  profile_completed_at: string | null
  created_at: string
  updated_at: string
}

export interface RiskProfileUpdateData {
  risk_profile: RiskProfile
  investment_horizon: string
  risk_score: number
  profile_completed_at: string
}
