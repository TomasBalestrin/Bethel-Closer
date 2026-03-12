import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import type { CrmCallStage, CrmColumnSettings } from '@/types'

interface ColumnSettingsInput {
  column_id: CrmCallStage
  custom_title?: string
  custom_subtitle?: string
}

/**
 * Hook for managing user-customizable column settings in the CRM Kanban board.
 * Each user can set custom titles and subtitles for any column.
 */
export function useColumnSettings() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // Fetch all column settings for the current user
  const { data: settings, isLoading } = useQuery({
    queryKey: ['crm-column-settings', user?.profileId],
    queryFn: async () => {
      if (!user?.profileId) return []

      const { data, error } = await supabase
        .from('crm_column_settings')
        .select('*')
        .eq('user_id', user.profileId)

      if (error) {
        // Table might not exist yet - return empty
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return [] as CrmColumnSettings[]
        }
        throw error
      }
      return data as CrmColumnSettings[]
    },
    enabled: !!user?.profileId
  })

  // Get settings for a specific column
  const getColumnSettings = (columnId: CrmCallStage): CrmColumnSettings | undefined => {
    return settings?.find(s => s.column_id === columnId)
  }

  // Get custom title for a column (or undefined if using default)
  const getCustomTitle = (columnId: CrmCallStage): string | undefined => {
    return settings?.find(s => s.column_id === columnId)?.custom_title
  }

  // Get custom subtitle for a column (or undefined if using default)
  const getCustomSubtitle = (columnId: CrmCallStage): string | undefined => {
    return settings?.find(s => s.column_id === columnId)?.custom_subtitle
  }

  // Create or update column settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (input: ColumnSettingsInput) => {
      if (!user?.profileId) throw new Error('User not authenticated')

      const existing = settings?.find(s => s.column_id === input.column_id)

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('crm_column_settings')
          .update({
            custom_title: input.custom_title || null,
            custom_subtitle: input.custom_subtitle || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)

        if (error) throw error
      } else {
        // Create new
        const { error } = await supabase
          .from('crm_column_settings')
          .insert({
            user_id: user.profileId,
            column_id: input.column_id,
            custom_title: input.custom_title || null,
            custom_subtitle: input.custom_subtitle || null
          })

        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-column-settings'] })
      toast.success('Configuracoes da coluna salvas!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar configuracoes')
    }
  })

  // Reset column to default settings
  const resetSettingsMutation = useMutation({
    mutationFn: async (columnId: CrmCallStage) => {
      if (!user?.profileId) throw new Error('User not authenticated')

      const existing = settings?.find(s => s.column_id === columnId)
      if (!existing) return // Nothing to reset

      const { error } = await supabase
        .from('crm_column_settings')
        .delete()
        .eq('id', existing.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-column-settings'] })
      toast.success('Coluna resetada para padrao!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao resetar configuracoes')
    }
  })

  return {
    settings,
    isLoading,
    getColumnSettings,
    getCustomTitle,
    getCustomSubtitle,
    updateSettings: updateSettingsMutation.mutate,
    resetSettings: resetSettingsMutation.mutate,
    isUpdating: updateSettingsMutation.isPending,
    isResetting: resetSettingsMutation.isPending
  }
}

export default useColumnSettings
