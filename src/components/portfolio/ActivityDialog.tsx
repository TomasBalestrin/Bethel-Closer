import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useCreateActivity } from '@/hooks/usePortfolio'
import { toast } from '@/hooks/use-toast'
import type { PortfolioStudent, StudentActivityType } from '@/types'

const activitySchema = z.object({
  type: z.enum(['intensivo', 'mentoria', 'evento']),
  title: z.string().min(2, 'Titulo deve ter pelo menos 2 caracteres'),
  description: z.string().optional(),
  event_date: z.string().optional()
})

type ActivityFormData = z.infer<typeof activitySchema>

interface ActivityDialogProps {
  student: PortfolioStudent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ActivityDialog({ student, open, onOpenChange }: ActivityDialogProps) {
  const createActivity = useCreateActivity()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      type: 'intensivo',
      title: '',
      description: '',
      event_date: ''
    }
  })

  const activityType = watch('type')

  const onSubmit = async (data: ActivityFormData) => {
    if (!student) return

    try {
      await createActivity.mutateAsync({
        student_id: student.id,
        type: data.type as StudentActivityType,
        title: data.title,
        description: data.description || undefined,
        event_date: data.event_date || undefined
      })

      toast({
        title: 'Atividade registrada',
        description: `${data.title} foi adicionada ao historico de ${student.name}.`
      })

      reset()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Erro ao registrar atividade',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive'
      })
    }
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  if (!student) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nova Atividade</DialogTitle>
          <DialogDescription>
            Registrar atividade para {student.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="activity-type">Tipo *</Label>
              <Select
                value={activityType}
                onValueChange={(value) => setValue('type', value as StudentActivityType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="intensivo">Intensivo</SelectItem>
                  <SelectItem value="mentoria">Mentoria</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-date">Data do Evento</Label>
              <Input
                id="event-date"
                type="date"
                {...register('event_date')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-title">Titulo *</Label>
            <Input
              id="activity-title"
              placeholder="Ex: Intensivo de Vendas - Turma 5"
              {...register('title')}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-description">Descricao</Label>
            <Textarea
              id="activity-description"
              placeholder="Detalhes sobre a atividade..."
              rows={3}
              {...register('description')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || createActivity.isPending}>
              {(isSubmitting || createActivity.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Registrar Atividade
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
