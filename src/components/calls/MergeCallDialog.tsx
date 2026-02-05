import { useEffect, useState } from 'react'
import { supabase } from '@/services/supabase'
import { analyzeCallTranscript } from '@/services/openai'
import { deriveResultStatus } from '@/services/driveSync'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Merge,
  Phone,
  Calendar,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Call, Client, CallResultStatus, CallAnalysisFull } from '@/types'
import { cn } from '@/lib/utils'

interface MergeCallDialogProps {
  currentCall: Call & { client?: Client }
  onMergeComplete: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

const RESULT_STATUS_LABELS: Record<CallResultStatus, string> = {
  pendente: 'Pendente',
  follow_up: 'Follow-up',
  proposta: 'Proposta',
  vendida: 'Vendida',
  perdida: 'Perdida'
}

export function MergeCallDialog({
  currentCall,
  onMergeComplete,
  open,
  onOpenChange
}: MergeCallDialogProps) {
  const [availableCalls, setAvailableCalls] = useState<(Call & { client?: Client })[]>([])
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    if (open) {
      fetchAvailableCalls()
    }
  }, [open, currentCall.id])

  const fetchAvailableCalls = async () => {
    try {
      setLoading(true)
      // Get calls from the same closer
      const { data, error } = await supabase
        .from('calls')
        .select('*, client:clients(id, name, email, phone, company)')
        .eq('closer_id', currentCall.closer_id)
        .neq('id', currentCall.id)
        .order('scheduled_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setAvailableCalls((data || []) as (Call & { client?: Client })[])
    } catch (error) {
      console.error('Error fetching calls:', error)
      toast.error('Erro ao carregar calls')
    } finally {
      setLoading(false)
    }
  }

  const handleMerge = async () => {
    if (!selectedCallId) {
      toast.error('Selecione uma call para juntar')
      return
    }

    const selectedCall = availableCalls.find(c => c.id === selectedCallId)
    if (!selectedCall) return

    setMerging(true)
    try {
      // Combine transcripts
      const transcript1 = currentCall.notes || ''
      const transcript2 = selectedCall.notes || ''

      if (!transcript1 && !transcript2) {
        toast.error('Ambas as calls não possuem transcrição')
        return
      }

      const combinedTranscript = [
        transcript1 ? `=== PARTE 1 ===\n${transcript1}` : '',
        transcript2 ? `=== PARTE 2 ===\n${transcript2}` : ''
      ].filter(Boolean).join('\n\n')

      // Update the primary call with combined transcript
      const { error: updateError } = await supabase
        .from('calls')
        .update({
          notes: combinedTranscript,
          ai_summary: 'Re-analisando após merge...',
          ai_analysis: null,
          quality_score: null
        })
        .eq('id', currentCall.id)

      if (updateError) throw updateError

      // Mark the secondary call as merged (soft delete)
      const { error: mergeError } = await supabase
        .from('calls')
        .update({
          notes: `[MERGED INTO ${currentCall.id}] ${selectedCall.notes || ''}`,
          ai_summary: `Mesclada com outra call`
        })
        .eq('id', selectedCallId)

      if (mergeError) {
        console.error('Error marking secondary call as merged:', mergeError)
        // Continue anyway - the main merge worked
      }

      // Re-analyze with combined transcript
      toast.info('Analisando transcrição combinada...')

      try {
        const analysis = await analyzeCallTranscript(combinedTranscript)
        const resultStatus = deriveResultStatus(analysis)

        const { error: analysisError } = await supabase
          .from('calls')
          .update({
            ai_summary: [
              analysis.identificacao?.produto_ofertado,
              analysis.dados_extraidos?.nicho_profissao,
              `Nota: ${analysis.nota_geral}/10`
            ].filter(Boolean).join(' | '),
            ai_analysis: {
              ...analysis,
              result_status: resultStatus,
              merged_from: [currentCall.id, selectedCallId]
            },
            quality_score: analysis.nota_geral || 0
          })
          .eq('id', currentCall.id)

        if (analysisError) throw analysisError

        toast.success(`Calls unidas! Nova nota: ${analysis.nota_geral}/10`)
      } catch (aiError) {
        console.error('AI analysis failed:', aiError)
        toast.warning('Calls unidas, mas análise de IA falhou. Tente analisar novamente.')
      }

      onMergeComplete()
    } catch (error) {
      console.error('Error merging calls:', error)
      toast.error('Erro ao juntar calls')
    } finally {
      setMerging(false)
    }
  }

  // Get display name for a call
  const getCallName = (call: Call & { client?: Client }) => {
    const analysis = call.ai_analysis as CallAnalysisFull | undefined
    return call.client?.name ||
      (analysis?.identificacao?.nome_lead && analysis.identificacao.nome_lead !== 'nao_informado'
        ? analysis.identificacao.nome_lead
        : null) ||
      'Call sem nome'
  }

  const getResultStatus = (call: Call): CallResultStatus => {
    const analysis = call.ai_analysis as CallAnalysisFull | undefined
    if (analysis?.result_status) return analysis.result_status
    return 'pendente'
  }

  const currentCallName = getCallName(currentCall)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-5 h-5" />
            Juntar Calls
          </DialogTitle>
          <DialogDescription>
            Selecione uma call para unir com "<strong>{currentCallName}</strong>".
            As transcrições serão combinadas e re-analisadas.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              A call selecionada será marcada como mesclada. A análise pode demorar 1-2 minutos.
            </p>
          </div>

          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : availableCalls.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma call disponível para juntar
                </div>
              ) : (
                availableCalls.map((call) => {
                  const callName = getCallName(call)
                  const status = getResultStatus(call)
                  const analysis = call.ai_analysis as CallAnalysisFull | undefined
                  const score = analysis?.nota_geral

                  return (
                    <div
                      key={call.id}
                      onClick={() => setSelectedCallId(call.id)}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all',
                        selectedCallId === call.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-muted-foreground/50'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Phone className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-sm truncate">{callName}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(call.scheduled_at), 'dd/MM/yyyy', { locale: ptBR })}
                            {score && (
                              <span className="text-primary font-medium">• {score}/10</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {RESULT_STATUS_LABELS[status]}
                      </Badge>
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
            Cancelar
          </Button>
          <Button
            onClick={handleMerge}
            disabled={merging || !selectedCallId}
          >
            {merging && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {merging ? 'Analisando...' : 'Juntar e Analisar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
