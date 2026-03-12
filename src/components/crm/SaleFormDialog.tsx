import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DollarSign, Loader2, FileText, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import type { CrmCallClient } from '@/types'

const saleFormSchema = z.object({
  sale_value: z.number().min(0.01, 'Valor da venda e obrigatorio'),
  entry_value: z.number().optional(),
  product_offered: z.string().optional(),
  contract_validity: z.string().optional(),
  sale_notes: z.string().optional()
})

type SaleFormData = z.infer<typeof saleFormSchema>

interface SaleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: CrmCallClient | null
  onSubmit: (data: SaleFormData) => void
  isSubmitting?: boolean
}

export function SaleFormDialog({
  open,
  onOpenChange,
  client,
  onSubmit,
  isSubmitting = false
}: SaleFormDialogProps) {
  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleFormSchema),
    defaultValues: {
      sale_value: undefined,
      entry_value: undefined,
      product_offered: '',
      contract_validity: '',
      sale_notes: ''
    }
  })

  // Reset form when dialog opens with a new client
  useEffect(() => {
    if (open && client) {
      form.reset({
        sale_value: client.sale_value || undefined,
        entry_value: client.entry_value || undefined,
        product_offered: client.product_offered || '',
        contract_validity: client.contract_validity || '',
        sale_notes: client.sale_notes || ''
      })
    }
  }, [open, client, form])

  const handleSubmit = (data: SaleFormData) => {
    onSubmit(data)
  }

  const handleCancel = () => {
    form.reset()
    onOpenChange(false)
  }

  // Format currency for display
  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return ''
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            Registrar Venda
          </DialogTitle>
          <DialogDescription>
            {client ? (
              <>Registre os detalhes da venda para <strong>{client.name}</strong>.</>
            ) : (
              'Preencha os dados da venda realizada.'
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Valores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sale_value" className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Valor da Venda (R$) *
              </Label>
              <Input
                id="sale_value"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                {...form.register('sale_value', { valueAsNumber: true })}
              />
              {form.formState.errors.sale_value && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.sale_value.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="entry_value" className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Valor de Entrada (R$)
              </Label>
              <Input
                id="entry_value"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                {...form.register('entry_value', { valueAsNumber: true })}
              />
            </div>
          </div>

          {/* Produto */}
          <div className="space-y-2">
            <Label htmlFor="product_offered" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Produto Vendido
            </Label>
            <Select
              value={form.watch('product_offered') || ''}
              onValueChange={(v) => form.setValue('product_offered', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o produto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="crm_calls">CRM Calls (R$ 29,90)</SelectItem>
                <SelectItem value="crm_intensivo">CRM Intensivo (R$ 12k)</SelectItem>
                <SelectItem value="mentoria">Mentoria Premium (R$ 80k)</SelectItem>
                <SelectItem value="consultoria">Consultoria</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Validade do Contrato */}
          <div className="space-y-2">
            <Label htmlFor="contract_validity" className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Validade do Contrato
            </Label>
            <Select
              value={form.watch('contract_validity') || ''}
              onValueChange={(v) => form.setValue('contract_validity', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a validade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1_mes">1 Mes</SelectItem>
                <SelectItem value="3_meses">3 Meses</SelectItem>
                <SelectItem value="6_meses">6 Meses</SelectItem>
                <SelectItem value="12_meses">12 Meses</SelectItem>
                <SelectItem value="24_meses">24 Meses</SelectItem>
                <SelectItem value="vitalicio">Vitalicio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observacoes */}
          <div className="space-y-2">
            <Label htmlFor="sale_notes">
              Observacoes da Venda
            </Label>
            <Textarea
              id="sale_notes"
              placeholder="Detalhes adicionais sobre a venda..."
              rows={3}
              {...form.register('sale_notes')}
            />
          </div>

          {/* Summary */}
          {form.watch('sale_value') && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                Resumo da Venda
              </p>
              <div className="mt-2 space-y-1 text-sm text-emerald-700 dark:text-emerald-300">
                <p>Valor Total: <strong>R$ {formatCurrency(form.watch('sale_value'))}</strong></p>
                {form.watch('entry_value') && (
                  <p>Entrada: R$ {formatCurrency(form.watch('entry_value'))}</p>
                )}
                {form.watch('product_offered') && (
                  <p>Produto: {form.watch('product_offered')}</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar Venda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default SaleFormDialog
