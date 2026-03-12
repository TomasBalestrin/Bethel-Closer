import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'

export function usePrefetch() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const prefetchCalls = useCallback(() => {
    if (!user?.profileId) return

    queryClient.prefetchQuery({
      queryKey: ['calls', user.profileId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('calls')
          .select('id, client_name, call_date, score, prd_status, product')
          .eq('closer_id', user.profileId)
          .is('merged_with_call_id', null)
          .order('call_date', { ascending: false })
          .limit(50)

        if (error) throw error
        return data
      },
      staleTime: 30000 // 30 seconds
    })
  }, [queryClient, user?.profileId])

  const prefetchClients = useCallback(() => {
    if (!user?.profileId) return

    queryClient.prefetchQuery({
      queryKey: ['clients', user.profileId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('clients')
          .select('id, name, crm_status, is_sold, phone, company')
          .eq('closer_id', user.profileId)
          .order('updated_at', { ascending: false })
          .limit(100)

        if (error) throw error
        return data
      },
      staleTime: 30000
    })
  }, [queryClient, user?.profileId])

  const prefetchPortfolio = useCallback(() => {
    if (!user?.profileId) return

    queryClient.prefetchQuery({
      queryKey: ['portfolio-students', user.profileId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('portfolio_students')
          .select('id, name, current_ticket, entry_date')
          .eq('closer_id', user.profileId)
          .order('entry_date', { ascending: false })
          .limit(50)

        if (error) throw error
        return data
      },
      staleTime: 30000
    })
  }, [queryClient, user?.profileId])

  const prefetchDailyVerse = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: ['daily-verse'],
      queryFn: async () => {
        const dayOfYear = Math.floor(
          (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
        )

        const { data, error } = await supabase
          .from('daily_verses')
          .select('verse_text, reference')
          .eq('day_of_year', dayOfYear)
          .single()

        if (error) return null
        return data
      },
      staleTime: 1000 * 60 * 60 // 1 hour
    })
  }, [queryClient])

  return {
    prefetchCalls,
    prefetchClients,
    prefetchPortfolio,
    prefetchDailyVerse
  }
}
