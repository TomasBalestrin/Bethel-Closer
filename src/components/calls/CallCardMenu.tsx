import { useState } from 'react'
import { MoreVertical, Eye, Merge, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MergeCallDialog } from './MergeCallDialog'
import type { Call, Client } from '@/types'
import { supabase } from '@/services/supabase'
import { toast } from 'sonner'

interface CallCardMenuProps {
  call: Call & { client?: Client }
  onViewDetails: () => void
  onAnalyze?: () => void
  onCallUpdated: () => void
  isAnalyzing?: boolean
}

export function CallCardMenu({
  call,
  onViewDetails,
  onAnalyze,
  onCallUpdated,
  isAnalyzing
}: CallCardMenuProps) {
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const hasAnalysis = !!(call.ai_analysis as Record<string, unknown>)?.nota_geral

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('calls')
        .delete()
        .eq('id', call.id)

      if (error) throw error

      toast.success('Call excluída com sucesso')
      onCallUpdated()
    } catch (error) {
      console.error('Error deleting call:', error)
      toast.error('Erro ao excluir call')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  // Get client name for display
  const clientName = call.client?.name ||
    ((call.ai_analysis as Record<string, unknown>)?.identificacao as Record<string, unknown>)?.nome_lead as string ||
    'Call'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onViewDetails}>
            <Eye className="h-4 w-4 mr-2" />
            Ver detalhes
          </DropdownMenuItem>

          {!hasAnalysis && call.notes && onAnalyze && (
            <DropdownMenuItem onClick={onAnalyze} disabled={isAnalyzing}>
              <Sparkles className="h-4 w-4 mr-2" />
              {isAnalyzing ? 'Analisando...' : 'Analisar com IA'}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={() => setShowMergeDialog(true)}>
            <Merge className="h-4 w-4 mr-2" />
            Juntar com outra call
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir call
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Merge Dialog */}
      <MergeCallDialog
        currentCall={call}
        onMergeComplete={() => {
          setShowMergeDialog(false)
          onCallUpdated()
        }}
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir call</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a call de <strong>{clientName}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
