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
import { useCreateIndication } from '@/hooks/usePortfolio'
import { toast } from '@/hooks/use-toast'
import type { PortfolioStudent, IndicationSource } from '@/types'

const indicationSchema = z.object({
  indicated_name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  indicated_phone: z.string().optional(),
  indicated_email: z.string().email('Email invalido').optional().or(z.literal('')),
  source: z.enum(['call', 'intensivo']),
  notes: z.string().optional()
})

type IndicationFormData = z.infer<typeof indicationSchema>

interface StudentIndicationDialogProps {
  student: PortfolioStudent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StudentIndicationDialog({ student, open, onOpenChange }: StudentIndicationDialogProps) {
  const createIndication = useCreateIndication()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<IndicationFormData>({
    resolver: zodResolver(indicationSchema),
    defaultValues: {
      indicated_name: '',
      indicated_phone: '',
      indicated_email: '',
      source: 'call',
      notes: ''
    }
  })

  const source = watch('source')

  const onSubmit = async (data: IndicationFormData) => {
    if (!student) return

    try {
      await createIndication.mutateAsync({
        student_id: student.id,
        indicated_name: data.indicated_name,
        indicated_phone: data.indicated_phone || undefined,
        indicated_email: data.indicated_email || undefined,
        source: data.source as IndicationSource,
        is_closed: false,
        notes: data.notes || undefined
      })

      toast({
        title: 'Indicacao registrada',
        description: `Indicacao de ${data.indicated_name} foi registrada.`
      })

      reset()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Erro ao registrar indicacao',
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
          <DialogTitle>Nova Indicacao</DialogTitle>
          <DialogDescription>
            Registrar indicacao feita por {student.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="indicated-name">Nome do Indicado *</Label>
            <Input
              id="indicated-name"
              placeholder="Nome completo"
              {...register('indicated_name')}
            />
            {errors.indicated_name && (
              <p className="text-sm text-destructive">{errors.indicated_name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="indicated-phone">Telefone</Label>
              <Input
                id="indicated-phone"
                placeholder="(00) 00000-0000"
                {...register('indicated_phone')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="indicated-email">Email</Label>
              <Input
                id="indicated-email"
                type="email"
                placeholder="email@exemplo.com"
                {...register('indicated_email')}
              />
              {errors.indicated_email && (
                <p className="text-sm text-destructive">{errors.indicated_email.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="indication-source">Origem da Indicacao *</Label>
            <Select
              value={source}
              onValueChange={(value) => setValue('source', value as IndicationSource)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="intensivo">Intensivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="indication-notes">Observacoes</Label>
            <Textarea
              id="indication-notes"
              placeholder="Informacoes adicionais sobre a indicacao..."
              rows={3}
              {...register('notes')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || createIndication.isPending}>
              {(isSubmitting || createIndication.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Registrar Indicacao
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
