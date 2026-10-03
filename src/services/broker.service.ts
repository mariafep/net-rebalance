import { supabase } from '../lib/supabase'
import type { Broker, BrokerFormData } from '../types/broker'

export const brokerService = {
    async getBrokers(): Promise<Broker[]> {
        const { data, error } = await supabase
            .from('brokers')
            .select(`
        id,
        user_id,
        name,
        fixed_commission,
        percentage_commission,
        spread_percentage,
        currency,
        created_at,
        updated_at
      `)
            .order('created_at', { ascending: false })

        if (error) {
            throw error
        }

        return data ?? []
    },

    async createBroker(
        userId: string,
        broker: BrokerFormData,
    ): Promise<Broker> {
        const { data, error } = await supabase
            .from('brokers')
            .insert({
                user_id: userId,
                name: broker.name,
                currency: broker.currency,
                fixed_commission: broker.fixed_commission,
                percentage_commission: broker.percentage_commission,
                spread_percentage: broker.spread_percentage,
            })
            .select()
            .single()

        if (error) {
            throw error
        }

        return data
    },

    async updateBroker(
        brokerId: string,
        broker: BrokerFormData,
    ): Promise<Broker> {
        const { data, error } = await supabase
            .from('brokers')
            .update({
                name: broker.name,
                currency: broker.currency,
                fixed_commission: broker.fixed_commission,
                percentage_commission: broker.percentage_commission,
                spread_percentage: broker.spread_percentage,
            })
            .eq('id', brokerId)
            .select()
            .single()

        if (error) {
            throw error
        }

        return data
    },

    async deleteBroker(brokerId: string): Promise<void> {
        const { error } = await supabase
            .from('brokers')
            .delete()
            .eq('id', brokerId)

        if (error) {
            throw error
        }
    },
}