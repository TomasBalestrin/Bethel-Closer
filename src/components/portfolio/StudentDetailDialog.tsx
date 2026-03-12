import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2,
  Calendar,
  TrendingUp,
  Activity,
  UserPlus,
  Save
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUpdateStudent, useStudentActivities, useStudentIndications } from '@/hooks/usePortfolio'
import { toast } from '@/hooks/use-toast'
import { formatDate, formatPhoneNumber } from '@/lib/utils'
import type { PortfolioStudent, PortfolioTicketType, StudentActivityType } from '@/types'

const updateSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional()
})

type UpdateFormData = z.infer<typeof updateSchema>

interface StudentDetailDialogProps {
  student: PortfolioStudent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ticketConfig: Record<PortfolioTicketType, {
  label: string
  color: string
  bgColor: string
}> = {
  '29_90': {
    label: 'R$ 29,90',
    color: 'text-pink-700 dark:text-pink-300',
    bgColor: 'bg-pink-100 dark:bg-pink-900/50'
  },
  '12k': {
    label: 'R$ 12K',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/50'
  },
  '80k': {
    label: 'R$ 80K',
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/50'
  }
}

const activityTypeConfig: Record<StudentActivityType, {
  label: string
  color: string
}> = {
  intensivo: { label: 'Intensivo', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' },
  mentoria: { label: 'Mentoria', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' },
  evento: { label: 'Evento', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300' }
}

export function StudentDetailDialog({ student, open, onOpenChange }: StudentDetailDialogProps) {
  const updateStudent = useUpdateStudent()
  const { data: activities = [] } = useStudentActivities(student?.id)
  const { data: indications = [] } = useStudentIndications(student?.id)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting }
  } = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    values: student ? {
      name: student.name,
      email: student.email || '',
      phone: student.phone || '',
      company: student.company || '',
      notes: student.notes || ''
    } : undefined
  })

  const onSubmit = async (data: UpdateFormData) => {
    if (!student) return

    try {
      await updateStudent.mutateAsync({
        id: student.id,
        data: {
          name: data.name,
          email: data.email || undefined,
          phone: data.phone || undefined,
          company: data.company || undefined,
          notes: data.notes || undefined
        }
      })

      toast({
        title: 'Aluno atualizado',
        description: 'As informacoes foram salvas com sucesso.'
      })

      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Erro ao atualizar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive'
      })
    }
  }

  if (!student) return null

  const ticket = ticketConfig[student.ticket_type]
  const hasAscended = student.original_ticket_type &&
    student.original_ticket_type !== student.ticket_type

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {student.name}
            <Badge className={`${ticket.bgColor} ${ticket.color} border-0`}>
              {ticket.label}
            </Badge>
            {hasAscended && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                <TrendingUp className="h-3 w-3 mr-1" />
                Ascendeu
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pr-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Informacoes Basicas</h3>

              <div className="space-y-2">
                <Label htmlFor="detail-name">Nome</Label>
                <Input
                  id="detail-name"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="detail-email">Email</Label>
                  <Input
                    id="detail-email"
                    type="email"
                    {...register('email')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detail-phone">Telefone</Label>
                  <Input
                    id="detail-phone"
                    {...register('phone')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="detail-company">Empresa</Label>
                <Input
                  id="detail-company"
                  {...register('company')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="detail-notes">Observacoes</Label>
                <Textarea
                  id="detail-notes"
                  rows={3}
                  {...register('notes')}
                />
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Aluno desde {formatDate(student.created_at)}</span>
              </div>
            </div>

            <Separator />

            {/* Activities */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Atividades ({activities.length})
                </h3>
              </div>

              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma atividade registrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {activities.slice(0, 5).map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={`${activityTypeConfig[activity.type].color} border-0 text-xs`}>
                          {activityTypeConfig[activity.type].label}
                        </Badge>
                        <span className="text-sm font-medium">{activity.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                  ))}
                  {activities.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{activities.length - 5} atividade(s)
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Indications */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Indicacoes ({indications.length})
                </h3>
              </div>

              {indications.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma indicacao registrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {indications.slice(0, 5).map((indication) => (
                    <div
                      key={indication.id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    >
                      <div>
                        <span className="text-sm font-medium">{indication.indicated_name}</span>
                        {indication.indicated_phone && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {formatPhoneNumber(indication.indicated_phone)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={indication.is_closed ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {indication.is_closed ? 'Fechada' : 'Aberta'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(indication.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {indications.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{indications.length - 5} indicacao(oes)
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Fechar
              </Button>
              <Button
                type="submit"
                disabled={!isDirty || isSubmitting || updateStudent.isPending}
              >
                {(isSubmitting || updateStudent.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <Save className="mr-2 h-4 w-4" />
                Salvar Alteracoes
              </Button>
            </DialogFooter>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
