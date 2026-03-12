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
import { useCreateStudent } from '@/hooks/usePortfolio'
import { toast } from '@/hooks/use-toast'
import type { PortfolioTicketType } from '@/types'

const studentSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  ticket_type: z.enum(['29_90', '12k', '80k']),
  notes: z.string().optional()
})

type StudentFormData = z.infer<typeof studentSchema>

interface NewStudentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewStudentDialog({ open, onOpenChange }: NewStudentDialogProps) {
  const createStudent = useCreateStudent()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      company: '',
      ticket_type: '29_90',
      notes: ''
    }
  })

  const ticketType = watch('ticket_type')

  const onSubmit = async (data: StudentFormData) => {
    try {
      await createStudent.mutateAsync({
        name: data.name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        company: data.company || undefined,
        ticket_type: data.ticket_type as PortfolioTicketType,
        notes: data.notes || undefined,
        closer_id: '' // Will be set in the hook
      })

      toast({
        title: 'Aluno cadastrado',
        description: `${data.name} foi adicionado ao seu portfolio.`
      })

      reset()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Erro ao cadastrar aluno',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive'
      })
    }
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Aluno</DialogTitle>
          <DialogDescription>
            Adicione um novo aluno ao seu portfolio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              placeholder="Nome do aluno"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                placeholder="(00) 00000-0000"
                {...register('phone')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Input
                id="company"
                placeholder="Nome da empresa"
                {...register('company')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket_type">Ticket *</Label>
              <Select
                value={ticketType}
                onValueChange={(value) => setValue('ticket_type', value as PortfolioTicketType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ticket" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="29_90">R$ 29,90</SelectItem>
                  <SelectItem value="12k">R$ 12.000</SelectItem>
                  <SelectItem value="80k">R$ 80.000</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observacoes</Label>
            <Textarea
              id="notes"
              placeholder="Anotacoes sobre o aluno..."
              rows={3}
              {...register('notes')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || createStudent.isPending}>
              {(isSubmitting || createStudent.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cadastrar Aluno
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
