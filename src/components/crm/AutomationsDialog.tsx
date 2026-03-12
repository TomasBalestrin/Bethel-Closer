import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowRight,
  Clock,
  Tag,
  Bell,
  Flame,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAutomations, TRIGGER_TYPE_LABELS, ACTION_TYPE_LABELS } from '@/hooks/useAutomations'
import { KANBAN_COLUMNS } from './KanbanBoard'
import type { CrmAutomation, AutomationTriggerType, AutomationActionType, CrmCallStage } from '@/types'

const automationSchema = z.object({
  name: z.string().min(1, 'Nome e obrigatorio'),
  description: z.string().optional(),
  trigger_type: z.enum(['days_in_column', 'followup_date_reached', 'tag_added', 'data_completed', 'no_interaction'] as const),
  trigger_column: z.string().optional(),
  trigger_days: z.number().optional(),
  trigger_tag: z.string().optional(),
  action_type: z.enum(['move_to_column', 'add_tag', 'remove_tag', 'send_notification', 'mark_super_hot'] as const),
  action_column: z.string().optional(),
  action_tag: z.string().optional(),
  action_message: z.string().optional()
})

type AutomationFormData = z.infer<typeof automationSchema>

interface AutomationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AutomationsDialog({ open, onOpenChange }: AutomationsDialogProps) {
  const {
    automations,
    isLoading,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleActive,
    isCreating,
    isUpdating,
    isDeleting
  } = useAutomations()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState<CrmAutomation | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const form = useForm<AutomationFormData>({
    resolver: zodResolver(automationSchema),
    defaultValues: {
      name: '',
      description: '',
      trigger_type: 'days_in_column',
      trigger_column: '',
      trigger_days: 3,
      trigger_tag: '',
      action_type: 'move_to_column',
      action_column: '',
      action_tag: '',
      action_message: ''
    }
  })

  const watchTriggerType = form.watch('trigger_type')
  const watchActionType = form.watch('action_type')

  const openCreateForm = () => {
    setEditingAutomation(null)
    form.reset({
      name: '',
      description: '',
      trigger_type: 'days_in_column',
      trigger_column: '',
      trigger_days: 3,
      trigger_tag: '',
      action_type: 'move_to_column',
      action_column: '',
      action_tag: '',
      action_message: ''
    })
    setIsFormOpen(true)
  }

  const openEditForm = (automation: CrmAutomation) => {
    setEditingAutomation(automation)
    form.reset({
      name: automation.name,
      description: automation.description || '',
      trigger_type: automation.trigger_type,
      trigger_column: automation.trigger_config.column_id || '',
      trigger_days: automation.trigger_config.days || 3,
      trigger_tag: automation.trigger_config.tag_name || '',
      action_type: automation.action_type,
      action_column: automation.action_config.target_column || '',
      action_tag: automation.action_config.tag_name || '',
      action_message: automation.action_config.notification_message || ''
    })
    setIsFormOpen(true)
  }

  const handleSubmit = (data: AutomationFormData) => {
    const automationData = {
      name: data.name,
      description: data.description,
      trigger_type: data.trigger_type,
      trigger_config: {
        column_id: data.trigger_column as CrmCallStage | undefined,
        days: data.trigger_days,
        tag_name: data.trigger_tag || undefined
      },
      action_type: data.action_type,
      action_config: {
        target_column: data.action_column as CrmCallStage | undefined,
        tag_name: data.action_tag || undefined,
        notification_message: data.action_message || undefined
      }
    }

    if (editingAutomation) {
      updateAutomation({ id: editingAutomation.id, data: automationData })
    } else {
      createAutomation(automationData)
    }

    setIsFormOpen(false)
    setEditingAutomation(null)
  }

  const handleDelete = () => {
    if (deleteId) {
      deleteAutomation(deleteId)
      setDeleteId(null)
    }
  }

  const getTriggerIcon = (type: AutomationTriggerType) => {
    switch (type) {
      case 'days_in_column': return <Clock className="h-4 w-4" />
      case 'tag_added': return <Tag className="h-4 w-4" />
      case 'followup_date_reached': return <Clock className="h-4 w-4" />
      case 'no_interaction': return <Clock className="h-4 w-4" />
      default: return <Zap className="h-4 w-4" />
    }
  }

  const getActionIcon = (type: AutomationActionType) => {
    switch (type) {
      case 'move_to_column': return <ArrowRight className="h-4 w-4" />
      case 'add_tag':
      case 'remove_tag': return <Tag className="h-4 w-4" />
      case 'send_notification': return <Bell className="h-4 w-4" />
      case 'mark_super_hot': return <Flame className="h-4 w-4" />
      default: return <Zap className="h-4 w-4" />
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Automacoes do CRM
            </DialogTitle>
            <DialogDescription>
              Configure regras automaticas para mover clientes, adicionar tags e enviar notificacoes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* Add button */}
            <Button onClick={openCreateForm} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Nova Automacao
            </Button>

            {/* Automations list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : automations?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhuma automacao configurada</p>
                <p className="text-sm">Crie sua primeira automacao para automatizar seu fluxo de trabalho.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {automations?.map(automation => (
                  <Card key={automation.id} className={!automation.is_active ? 'opacity-60' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm truncate">{automation.name}</h4>
                            <Badge variant={automation.is_active ? 'default' : 'secondary'} className="text-xs">
                              {automation.is_active ? 'Ativa' : 'Inativa'}
                            </Badge>
                          </div>

                          {/* Collapsed view */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              {getTriggerIcon(automation.trigger_type)}
                              {TRIGGER_TYPE_LABELS[automation.trigger_type]}
                            </span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="flex items-center gap-1">
                              {getActionIcon(automation.action_type)}
                              {ACTION_TYPE_LABELS[automation.action_type]}
                            </span>
                          </div>

                          {/* Expanded view */}
                          {expandedId === automation.id && (
                            <div className="mt-3 p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                              {automation.description && (
                                <p className="text-muted-foreground">{automation.description}</p>
                              )}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="font-medium text-xs text-muted-foreground mb-1">Gatilho</p>
                                  <p>{TRIGGER_TYPE_LABELS[automation.trigger_type]}</p>
                                  {automation.trigger_config.column_id && (
                                    <p className="text-xs text-muted-foreground">
                                      Coluna: {KANBAN_COLUMNS.find(c => c.id === automation.trigger_config.column_id)?.title}
                                    </p>
                                  )}
                                  {automation.trigger_config.days && (
                                    <p className="text-xs text-muted-foreground">
                                      Dias: {automation.trigger_config.days}
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-xs text-muted-foreground mb-1">Acao</p>
                                  <p>{ACTION_TYPE_LABELS[automation.action_type]}</p>
                                  {automation.action_config.target_column && (
                                    <p className="text-xs text-muted-foreground">
                                      Para: {KANBAN_COLUMNS.find(c => c.id === automation.action_config.target_column)?.title}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setExpandedId(expandedId === automation.id ? null : automation.id)}
                          >
                            {expandedId === automation.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                          <Switch
                            checked={automation.is_active}
                            onCheckedChange={(checked) => toggleActive(automation.id, checked)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditForm(automation)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(automation.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAutomation ? 'Editar Automacao' : 'Nova Automacao'}
            </DialogTitle>
            <DialogDescription>
              Configure quando e como a automacao deve ser executada.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Ex: Mover para Repitch apos 3 dias"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descricao</Label>
              <Input
                id="description"
                placeholder="Descricao opcional..."
                {...form.register('description')}
              />
            </div>

            {/* Trigger */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Quando (Gatilho)
              </p>

              <div className="space-y-2">
                <Label>Tipo de gatilho</Label>
                <Select
                  value={watchTriggerType}
                  onValueChange={(v) => form.setValue('trigger_type', v as AutomationTriggerType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Trigger-specific fields */}
              {watchTriggerType === 'days_in_column' && (
                <>
                  <div className="space-y-2">
                    <Label>Coluna</Label>
                    <Select
                      value={form.watch('trigger_column') || ''}
                      onValueChange={(v) => form.setValue('trigger_column', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        {KANBAN_COLUMNS.map(col => (
                          <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Dias</Label>
                    <Input
                      type="number"
                      min="1"
                      {...form.register('trigger_days', { valueAsNumber: true })}
                    />
                  </div>
                </>
              )}

              {watchTriggerType === 'tag_added' && (
                <div className="space-y-2">
                  <Label>Tag</Label>
                  <Input
                    placeholder="Nome da tag"
                    {...form.register('trigger_tag')}
                  />
                </div>
              )}
            </div>

            {/* Action */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-blue-500" />
                Entao (Acao)
              </p>

              <div className="space-y-2">
                <Label>Tipo de acao</Label>
                <Select
                  value={watchActionType}
                  onValueChange={(v) => form.setValue('action_type', v as AutomationActionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTION_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Action-specific fields */}
              {watchActionType === 'move_to_column' && (
                <div className="space-y-2">
                  <Label>Mover para coluna</Label>
                  <Select
                    value={form.watch('action_column') || ''}
                    onValueChange={(v) => form.setValue('action_column', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      {KANBAN_COLUMNS.map(col => (
                        <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(watchActionType === 'add_tag' || watchActionType === 'remove_tag') && (
                <div className="space-y-2">
                  <Label>Tag</Label>
                  <Input
                    placeholder="Nome da tag"
                    {...form.register('action_tag')}
                  />
                </div>
              )}

              {watchActionType === 'send_notification' && (
                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Input
                    placeholder="Mensagem da notificacao"
                    {...form.register('action_message')}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsFormOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreating || isUpdating}>
                {(isCreating || isUpdating) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingAutomation ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Automacao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta automacao? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default AutomationsDialog
