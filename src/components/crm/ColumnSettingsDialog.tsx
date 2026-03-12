import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { useColumnSettings } from '@/hooks/useColumnSettings'
import type { KanbanColumnDef } from '@/types'

interface ColumnSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  column: KanbanColumnDef
  currentTitle?: string
  currentSubtitle?: string
}

interface FormData {
  custom_title: string
  custom_subtitle: string
}

export function ColumnSettingsDialog({
  open,
  onOpenChange,
  column,
  currentTitle,
  currentSubtitle
}: ColumnSettingsDialogProps) {
  const { updateSettings, resetSettings, isUpdating, isResetting } = useColumnSettings()
  const [hasChanges, setHasChanges] = useState(false)

  const form = useForm<FormData>({
    defaultValues: {
      custom_title: currentTitle || '',
      custom_subtitle: currentSubtitle || ''
    }
  })

  // Reset form when dialog opens or column changes
  useEffect(() => {
    if (open) {
      form.reset({
        custom_title: currentTitle || '',
        custom_subtitle: currentSubtitle || ''
      })
      setHasChanges(false)
    }
  }, [open, currentTitle, currentSubtitle, form])

  // Track changes
  const watchedValues = form.watch()
  useEffect(() => {
    const titleChanged = watchedValues.custom_title !== (currentTitle || '')
    const subtitleChanged = watchedValues.custom_subtitle !== (currentSubtitle || '')
    setHasChanges(titleChanged || subtitleChanged)
  }, [watchedValues, currentTitle, currentSubtitle])

  const handleSubmit = (data: FormData) => {
    updateSettings({
      column_id: column.id,
      custom_title: data.custom_title.trim() || undefined,
      custom_subtitle: data.custom_subtitle.trim() || undefined
    })
    onOpenChange(false)
  }

  const handleReset = () => {
    resetSettings(column.id)
    form.reset({
      custom_title: '',
      custom_subtitle: ''
    })
    onOpenChange(false)
  }

  const isCustomized = currentTitle !== undefined || currentSubtitle !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configuracoes da Coluna</DialogTitle>
          <DialogDescription>
            Personalize o titulo e subtitulo desta coluna. As alteracoes sao salvas apenas para voce.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Preview */}
          <div className={`p-3 rounded-lg border-t-4 ${column.borderColor} bg-muted/50`}>
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${column.bgColor}`} />
              <span className="font-semibold text-sm">
                {watchedValues.custom_title || column.title}
              </span>
            </div>
            {(watchedValues.custom_subtitle || column.subtitle) && (
              <p className="text-xs text-muted-foreground mt-1">
                {watchedValues.custom_subtitle || column.subtitle}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom_title">
                Titulo personalizado
              </Label>
              <Input
                id="custom_title"
                placeholder={column.title}
                {...form.register('custom_title')}
              />
              <p className="text-xs text-muted-foreground">
                Padrao: {column.title}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom_subtitle">
                Subtitulo personalizado
              </Label>
              <Input
                id="custom_subtitle"
                placeholder={column.subtitle || 'Nenhum'}
                {...form.register('custom_subtitle')}
              />
              <p className="text-xs text-muted-foreground">
                Padrao: {column.subtitle || 'Nenhum'}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isCustomized && (
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={isResetting}
                className="mr-auto"
              >
                {isResetting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Restaurar padrao
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isUpdating || !hasChanges}
            >
              {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ColumnSettingsDialog
