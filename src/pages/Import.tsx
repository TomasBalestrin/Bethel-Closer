import { useState, useCallback, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Sparkles,
  Table,
  ArrowRight,
  FileUp,
  Eye
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/services/supabase'
import { analyzeCallTranscript } from '@/services/openai'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import type { Client } from '@/types'

// CSV column mapping types
type ClientField = 'name' | 'email' | 'phone' | 'company' | 'status' | 'source' | 'ticket_type' | 'entry_value' | 'sale_value' | 'notes' | '__skip__'

const clientFieldLabels: Record<ClientField, string> = {
  name: 'Nome',
  email: 'Email',
  phone: 'Telefone',
  company: 'Empresa',
  status: 'Status',
  source: 'Origem',
  ticket_type: 'Tipo de Ticket',
  entry_value: 'Valor de Entrada',
  sale_value: 'Valor de Venda',
  notes: 'Observações',
  __skip__: '(Ignorar)'
}

const statusMap: Record<string, string> = {
  'lead': 'lead',
  'novo': 'lead',
  'new': 'lead',
  'contactado': 'contacted',
  'contacted': 'contacted',
  'em contato': 'contacted',
  'negociando': 'negotiating',
  'negotiating': 'negotiating',
  'em negociação': 'negotiating',
  'fechado': 'closed_won',
  'won': 'closed_won',
  'ganho': 'closed_won',
  'closed_won': 'closed_won',
  'perdido': 'closed_lost',
  'lost': 'closed_lost',
  'closed_lost': 'closed_lost'
}

const sourceMap: Record<string, string> = {
  'organic': 'organic',
  'orgânico': 'organic',
  'referral': 'referral',
  'indicação': 'referral',
  'ads': 'ads',
  'anúncios': 'ads',
  'event': 'event',
  'evento': 'event',
  'other': 'other',
  'outro': 'other'
}

export default function ImportPage() {
  const { user } = useAuthStore()

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Dados</h1>
        <p className="text-muted-foreground mt-1">
          Importe transcrições de ligações ou clientes via CSV
        </p>
      </div>

      <Tabs defaultValue="transcription" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="transcription" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Transcrições
          </TabsTrigger>
          <TabsTrigger value="csv" className="flex items-center gap-2">
            <Table className="h-4 w-4" />
            Importar CSV
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transcription">
          <TranscriptionImport userId={user?.id} />
        </TabsContent>

        <TabsContent value="csv">
          <CsvImport userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==========================================
// TRANSCRIPTION IMPORT
// ==========================================

function TranscriptionImport({ userId }: { userId?: string }) {
  const [transcript, setTranscript] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedCallId, setSelectedCallId] = useState('')
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch clients for association
  const { data: clients = [] } = useQuery({
    queryKey: ['import-clients', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, phone')
        .eq('closer_id', userId!)
        .order('name')
      if (error) throw error
      return data as Pick<Client, 'id' | 'name' | 'email' | 'phone'>[]
    },
    enabled: !!userId
  })

  // Fetch calls for the selected client
  const { data: clientCalls = [] } = useQuery({
    queryKey: ['import-client-calls', selectedClientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('id, scheduled_at, status')
        .eq('client_id', selectedClientId)
        .order('scheduled_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!selectedClientId
  })

  // Analyze transcription mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!transcript.trim()) throw new Error('Digite ou carregue uma transcrição')

      const analysis = await analyzeCallTranscript(transcript)
      return analysis
    },
    onSuccess: async (analysis) => {
      setAnalysisResult(analysis as unknown as Record<string, unknown>)
      setShowResultDialog(true)

      // If a call is selected, save the analysis to it
      if (selectedCallId) {
        const { error } = await supabase
          .from('calls')
          .update({
            ai_analysis: analysis as unknown as Record<string, unknown>,
            ai_summary: analysis.summary,
            quality_score: analysis.score
          })
          .eq('id', selectedCallId)

        if (error) {
          toast.error('Análise feita, mas erro ao salvar na ligação: ' + error.message)
        } else {
          toast.success('Transcrição analisada e salva na ligação!')
        }
      } else {
        toast.success('Transcrição analisada com sucesso!')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao analisar transcrição')
    }
  })

  // Handle text file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.match(/\.(txt|text|md|csv|log)$/i)) {
      toast.error('Use um arquivo de texto (.txt, .md, .csv, .log)')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setTranscript(text)
      toast.success(`Arquivo "${file.name}" carregado`)
    }
    reader.onerror = () => {
      toast.error('Erro ao ler o arquivo')
    }
    reader.readAsText(file)

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Input area */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Transcrição da Ligação
            </CardTitle>
            <CardDescription>
              Cole a transcrição ou carregue um arquivo de texto para análise com IA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="transcript">Texto da transcrição</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Carregar arquivo
                  </Button>
                  {transcript && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTranscript('')}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Limpar
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.text,.md,.csv,.log"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Textarea
                id="transcript"
                placeholder="Cole aqui a transcrição da ligação ou carregue um arquivo de texto..."
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {transcript.length > 0 ? `${transcript.length} caracteres | ~${Math.ceil(transcript.split(/\s+/).length)} palavras` : 'Nenhuma transcrição carregada'}
              </p>
            </div>

            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={!transcript.trim() || analyzeMutation.isPending}
              className="w-full"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analisando com IA...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analisar Transcrição com IA
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right: Association panel */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Associar a Ligação</CardTitle>
            <CardDescription>
              Opcionalmente associe esta transcrição a um cliente e ligação existente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={selectedClientId} onValueChange={(v) => { setSelectedClientId(v); setSelectedCallId('') }}>
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClientId && clientCalls.length > 0 && (
              <div>
                <Label>Ligação</Label>
                <Select value={selectedCallId} onValueChange={setSelectedCallId}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Selecione uma ligação" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientCalls.map((call) => (
                      <SelectItem key={call.id} value={call.id}>
                        {new Date(call.scheduled_at).toLocaleDateString('pt-BR')} - {call.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedClientId && clientCalls.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma ligação encontrada para este cliente
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dicas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Formatos aceitos:</strong> .txt, .md, .csv, .log
            </p>
            <p>
              <strong className="text-foreground">Tamanho máximo:</strong> 5MB
            </p>
            <p>
              <strong className="text-foreground">IA analisa:</strong> sentimento, objeções, sinais de compra, pontuação de fechamento e ações recomendadas
            </p>
            <p>
              Se associar a uma ligação, o resultado será salvo automaticamente nela.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Analysis Result Dialog */}
      <AnalysisResultDialog
        open={showResultDialog}
        onOpenChange={setShowResultDialog}
        result={analysisResult}
      />
    </div>
  )
}

function AnalysisResultDialog({
  open,
  onOpenChange,
  result
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: Record<string, unknown> | null
}) {
  if (!result) return null

  const sentiment = result.sentiment as string
  const score = result.score as number
  const summary = result.summary as string
  const keyPoints = (result.key_points || []) as string[]
  const objections = (result.objections || []) as string[]
  const buyingSignals = (result.buying_signals || []) as string[]
  const riskFactors = (result.risk_factors || []) as string[]
  const recommendedActions = (result.recommended_actions || []) as string[]
  const nextSteps = (result.next_steps || []) as string[]

  const sentimentColors: Record<string, string> = {
    positive: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    neutral: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    negative: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  }

  const sentimentLabels: Record<string, string> = {
    positive: 'Positivo',
    neutral: 'Neutro',
    negative: 'Negativo'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Resultado da Análise IA
          </DialogTitle>
          <DialogDescription>
            Análise detalhada da transcrição da ligação
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Score and Sentiment */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Sentimento:</span>
              <Badge className={sentimentColors[sentiment] || ''}>
                {sentimentLabels[sentiment] || sentiment}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Score:</span>
              <Badge variant={score >= 70 ? 'default' : score >= 40 ? 'secondary' : 'destructive'}>
                {score}/100
              </Badge>
            </div>
          </div>

          {/* Summary */}
          {summary && (
            <div>
              <h4 className="font-medium mb-1">Resumo</h4>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{summary}</p>
            </div>
          )}

          {/* Key Points */}
          {keyPoints.length > 0 && (
            <div>
              <h4 className="font-medium mb-1">Pontos Principais</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {keyPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Objections */}
          {objections.length > 0 && (
            <div>
              <h4 className="font-medium mb-1">Objeções</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {objections.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                    {obj}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Buying Signals */}
          {buyingSignals.length > 0 && (
            <div>
              <h4 className="font-medium mb-1">Sinais de Compra</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {buyingSignals.map((signal, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk Factors */}
          {riskFactors.length > 0 && (
            <div>
              <h4 className="font-medium mb-1">Fatores de Risco</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {riskFactors.map((risk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Actions */}
          {recommendedActions.length > 0 && (
            <div>
              <h4 className="font-medium mb-1">Ações Recomendadas</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {recommendedActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Steps */}
          {nextSteps.length > 0 && (
            <div>
              <h4 className="font-medium mb-1">Próximos Passos</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================
// CSV IMPORT
// ==========================================

interface CsvData {
  headers: string[]
  rows: string[][]
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done'

function CsvImport({ userId }: { userId?: string }) {
  const [step, setStep] = useState<Step>('upload')
  const [csvData, setCsvData] = useState<CsvData | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<number, ClientField>>({})
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] }>({ success: 0, errors: [] })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Parse CSV
  const parseCsv = useCallback((text: string): CsvData => {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    if (lines.length < 2) throw new Error('CSV deve ter pelo menos uma linha de cabeçalho e uma de dados')

    const parseLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if ((char === ',' || char === ';') && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map(parseLine).filter(row => row.some(cell => cell.trim()))

    return { headers, rows }
  }, [])

  // Auto-map columns based on header names
  const autoMapColumns = useCallback((headers: string[]) => {
    const mapping: Record<number, ClientField> = {}
    const headerMap: Record<string, ClientField> = {
      'nome': 'name',
      'name': 'name',
      'cliente': 'name',
      'client': 'name',
      'email': 'email',
      'e-mail': 'email',
      'telefone': 'phone',
      'phone': 'phone',
      'tel': 'phone',
      'celular': 'phone',
      'whatsapp': 'phone',
      'empresa': 'company',
      'company': 'company',
      'status': 'status',
      'origem': 'source',
      'source': 'source',
      'fonte': 'source',
      'ticket': 'ticket_type',
      'tipo': 'ticket_type',
      'produto': 'ticket_type',
      'product': 'ticket_type',
      'valor entrada': 'entry_value',
      'entry value': 'entry_value',
      'entrada': 'entry_value',
      'valor venda': 'sale_value',
      'sale value': 'sale_value',
      'venda': 'sale_value',
      'valor': 'sale_value',
      'notas': 'notes',
      'notes': 'notes',
      'observações': 'notes',
      'obs': 'notes'
    }

    headers.forEach((header, index) => {
      const normalized = header.toLowerCase().trim()
      if (headerMap[normalized]) {
        mapping[index] = headerMap[normalized]
      }
    })

    return mapping
  }, [])

  // Handle CSV file upload
  const handleCsvUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast.error('Use um arquivo CSV (.csv ou .txt)')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 10MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const data = parseCsv(text)
        setCsvData(data)

        const mapping = autoMapColumns(data.headers)
        setColumnMapping(mapping)

        setStep('mapping')
        toast.success(`${data.rows.length} linhas encontradas`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao ler CSV')
      }
    }
    reader.onerror = () => {
      toast.error('Erro ao ler o arquivo')
    }
    reader.readAsText(file)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [parseCsv, autoMapColumns])

  // Build preview data from mapping
  const previewData = csvData?.rows.slice(0, 5).map(row => {
    const client: Record<string, string> = {}
    Object.entries(columnMapping).forEach(([colIndex, field]) => {
      if (field !== '__skip__') {
        client[field] = row[parseInt(colIndex)] || ''
      }
    })
    return client
  }) || []

  // Check if name is mapped (required)
  const hasNameMapping = Object.values(columnMapping).includes('name')

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!csvData || !userId) throw new Error('Dados incompletos')
      if (!hasNameMapping) throw new Error('Mapeie pelo menos a coluna "Nome"')

      setStep('importing')
      let success = 0
      const errors: string[] = []

      for (let i = 0; i < csvData.rows.length; i++) {
        const row = csvData.rows[i]
        try {
          const record: Record<string, unknown> = { closer_id: userId }

          Object.entries(columnMapping).forEach(([colIndex, field]) => {
            if (field === '__skip__') return
            const value = row[parseInt(colIndex)]?.trim()
            if (!value) return

            switch (field) {
              case 'status':
                record.status = statusMap[value.toLowerCase()] || 'lead'
                break
              case 'source':
                record.source = sourceMap[value.toLowerCase()] || 'other'
                break
              case 'entry_value':
              case 'sale_value':
                record[field] = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.')) || null
                break
              default:
                record[field] = value
            }
          })

          // Ensure required fields
          if (!record.name) {
            errors.push(`Linha ${i + 2}: Nome vazio, pulando`)
            continue
          }
          if (!record.email) record.email = ''
          if (!record.phone) record.phone = ''
          if (!record.status) record.status = 'lead'
          if (!record.source) record.source = 'other'

          const { error } = await supabase
            .from('clients')
            .insert(record)

          if (error) {
            errors.push(`Linha ${i + 2} (${record.name}): ${error.message}`)
          } else {
            success++
          }
        } catch (err) {
          errors.push(`Linha ${i + 2}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
        }
      }

      return { success, errors }
    },
    onSuccess: (results) => {
      if (results) {
        setImportResults(results)
        setStep('done')
        if (results.success > 0) {
          toast.success(`${results.success} clientes importados com sucesso!`)
        }
        if (results.errors.length > 0) {
          toast.warning(`${results.errors.length} erros durante importação`)
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
      setStep('mapping')
    }
  })

  // Reset all state
  const handleReset = () => {
    setStep('upload')
    setCsvData(null)
    setColumnMapping({})
    setImportResults({ success: 0, errors: [] })
  }

  return (
    <div className="space-y-6">
      {/* Progress steps */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { key: 'upload', label: 'Upload' },
          { key: 'mapping', label: 'Mapeamento' },
          { key: 'preview', label: 'Prévia' },
          { key: 'done', label: 'Concluído' }
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            <Badge
              variant={
                step === s.key || (step === 'importing' && s.key === 'done')
                  ? 'default'
                  : ['upload', 'mapping', 'preview', 'importing', 'done'].indexOf(step) > ['upload', 'mapping', 'preview', 'importing', 'done'].indexOf(s.key)
                    ? 'secondary'
                    : 'outline'
              }
            >
              {s.label}
            </Badge>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Upload de CSV
            </CardTitle>
            <CardDescription>
              Selecione um arquivo CSV com os dados dos clientes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-foreground font-medium mb-1">
                Clique para selecionar ou arraste o arquivo
              </p>
              <p className="text-sm text-muted-foreground">
                CSV separado por vírgula ou ponto-e-vírgula. Máximo 10MB.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleCsvUpload}
            />

            <div className="mt-6">
              <h4 className="font-medium text-sm mb-2">Formato esperado:</h4>
              <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto">
                <div className="text-muted-foreground">Nome,Email,Telefone,Empresa,Status,Origem,Valor</div>
                <div className="text-foreground">João Silva,joao@email.com,11999887766,Empresa XYZ,lead,organic,12000</div>
                <div className="text-foreground">Maria Santos,maria@email.com,21988776655,Startup ABC,contacted,ads,80000</div>
              </div>
            </div>

            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Baixar template CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && csvData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Table className="h-5 w-5" />
              Mapeamento de Colunas
            </CardTitle>
            <CardDescription>
              Associe as colunas do CSV aos campos do sistema. {csvData.rows.length} linhas encontradas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {csvData.headers.map((header, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="min-w-[200px]">
                    <Badge variant="outline" className="font-mono">
                      {header}
                    </Badge>
                    {csvData.rows[0]?.[index] && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ex: {csvData.rows[0][index].substring(0, 30)}
                      </span>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Select
                    value={columnMapping[index] || '__skip__'}
                    onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [index]: v as ClientField }))}
                  >
                    <SelectTrigger className="w-[200px] bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(clientFieldLabels).map(([field, label]) => (
                        <SelectItem key={field} value={field}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {!hasNameMapping && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                Mapeie pelo menos a coluna "Nome" para continuar
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                Voltar
              </Button>
              <Button
                onClick={() => setStep('preview')}
                disabled={!hasNameMapping}
              >
                <Eye className="h-4 w-4 mr-2" />
                Visualizar prévia
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && csvData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Prévia da Importação
            </CardTitle>
            <CardDescription>
              Confira os primeiros 5 registros antes de importar. Total: {csvData.rows.length} registros.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {Object.entries(columnMapping)
                      .filter(([, field]) => field !== '__skip__')
                      .map(([, field]) => (
                        <th key={field} className="text-left p-2 font-medium text-foreground">
                          {clientFieldLabels[field]}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, i) => (
                    <tr key={i} className="border-b border-border">
                      {Object.entries(columnMapping)
                        .filter(([, field]) => field !== '__skip__')
                        .map(([, field]) => (
                          <td key={field} className="p-2 text-muted-foreground">
                            {row[field] || '-'}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {csvData.rows.length > 5 && (
              <p className="text-sm text-muted-foreground">
                ... e mais {csvData.rows.length - 5} registros
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Voltar ao mapeamento
              </Button>
              <Button onClick={() => importMutation.mutate()}>
                <Upload className="h-4 w-4 mr-2" />
                Importar {csvData.rows.length} clientes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
            <p className="text-foreground font-medium">Importando clientes...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Isso pode demorar alguns instantes
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Done */}
      {step === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
              Importação Concluída
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResults.success}</p>
                <p className="text-sm text-green-600 dark:text-green-400">Importados com sucesso</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResults.errors.length}</p>
                <p className="text-sm text-red-600 dark:text-red-400">Erros</p>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-sm">Detalhes dos erros:</h4>
                <div className="bg-muted rounded-lg p-3 max-h-[200px] overflow-y-auto space-y-1">
                  {importResults.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive font-mono">{err}</p>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleReset}>
              Nova Importação
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Download CSV template
function handleDownloadTemplate() {
  const template = 'Nome,Email,Telefone,Empresa,Status,Origem,Valor de Venda,Observações\nJoão Silva,joao@email.com,11999887766,Empresa XYZ,lead,organic,12000,Cliente interessado\nMaria Santos,maria@email.com,21988776655,Startup ABC,contacted,ads,80000,Retornar ligação'
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'template_importacao_clientes.csv'
  link.click()
  URL.revokeObjectURL(url)
}
