import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import type { CrmAutomation, AutomationTriggerType, AutomationActionType, CrmCallStage } from '@/types'

interface AutomationInput {
  name: string
  description?: string
  is_active?: boolean
  trigger_type: AutomationTriggerType
  trigger_config: {
    column_id?: CrmCallStage
    days?: number
    tag_name?: string
    fields?: string[]
  }
  action_type: AutomationActionType
  action_config: {
    target_column?: CrmCallStage
    tag_name?: string
    notification_message?: string
  }
}

/**
 * Hook for managing CRM automations.
 * Automations allow users to define rules that automatically perform actions
 * based on specific triggers (e.g., days in column, tag added, etc.)
 */
export function useAutomations() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // Fetch all automations for the current user
  const { data: automations, isLoading } = useQuery({
    queryKey: ['crm-automations', user?.profileId],
    queryFn: async () => {
      if (!user?.profileId) return []

      const { data, error } = await supabase
        .from('crm_automations')
        .select('*')
        .eq('user_id', user.profileId)
        .order('created_at', { ascending: false })

      if (error) {
        // Table might not exist yet - return empty
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return [] as CrmAutomation[]
        }
        throw error
      }
      return data as CrmAutomation[]
    },
    enabled: !!user?.profileId
  })

  // Get active automations only
  const activeAutomations = automations?.filter(a => a.is_active) || []

  // Create automation
  const createMutation = useMutation({
    mutationFn: async (input: AutomationInput) => {
      if (!user?.profileId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('crm_automations')
        .insert({
          user_id: user.profileId,
          name: input.name,
          description: input.description || null,
          is_active: input.is_active ?? true,
          trigger_type: input.trigger_type,
          trigger_config: input.trigger_config,
          action_type: input.action_type,
          action_config: input.action_config
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-automations'] })
      toast.success('Automacao criada com sucesso!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar automacao')
    }
  })

  // Update automation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AutomationInput> & { is_active?: boolean } }) => {
      const { error } = await supabase
        .from('crm_automations')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-automations'] })
      toast.success('Automacao atualizada!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar automacao')
    }
  })

  // Delete automation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_automations')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-automations'] })
      toast.success('Automacao excluida!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir automacao')
    }
  })

  // Toggle automation active status
  const toggleActive = (id: string, isActive: boolean) => {
    updateMutation.mutate({ id, data: { is_active: isActive } })
  }

  // Get automations for a specific trigger type
  const getAutomationsForTrigger = (triggerType: AutomationTriggerType): CrmAutomation[] => {
    return activeAutomations.filter(a => a.trigger_type === triggerType)
  }

  // Get automations that apply to a specific column
  const getAutomationsForColumn = (columnId: CrmCallStage): CrmAutomation[] => {
    return activeAutomations.filter(a => a.trigger_config.column_id === columnId)
  }

  return {
    automations,
    activeAutomations,
    isLoading,
    createAutomation: createMutation.mutate,
    updateAutomation: updateMutation.mutate,
    deleteAutomation: deleteMutation.mutate,
    toggleActive,
    getAutomationsForTrigger,
    getAutomationsForColumn,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending
  }
}

// Helper constants for trigger and action types
export const TRIGGER_TYPE_LABELS: Record<AutomationTriggerType, string> = {
  days_in_column: 'Dias na coluna',
  followup_date_reached: 'Data de followup atingida',
  tag_added: 'Tag adicionada',
  data_completed: 'Dados preenchidos',
  no_interaction: 'Sem interacao'
}

export const ACTION_TYPE_LABELS: Record<AutomationActionType, string> = {
  move_to_column: 'Mover para coluna',
  add_tag: 'Adicionar tag',
  remove_tag: 'Remover tag',
  send_notification: 'Enviar notificacao',
  mark_super_hot: 'Marcar como Super Hot'
}

export default useAutomations
