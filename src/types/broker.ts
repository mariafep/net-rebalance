export interface Broker {
    id: string
    user_id: string
    name: string
    fixed_commission: number
    percentage_commission: number
    spread_percentage: number
    currency: string
    created_at: string
    updated_at: string
}

export interface BrokerFormData {
    name: string
    currency: string
    fixed_commission: number
    percentage_commission: number
    spread_percentage: number
}