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
  Eye,
  Cloud,
  Shield,
  FolderOpen,
  Zap
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
import * as drive from '@/services/googleDrive'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import type { Client } from '@/types'

// ==========================================
// MAIN PAGE
// ==========================================

export default function ImportPage() {
  const { user } = useAuthStore()

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Dados</h1>
        <p className="text-muted-foreground mt-1">
          Conecte seu Google Drive ou importe manualmente
        </p>
      </div>

      <Tabs defaultValue="drive" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="drive" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Google Drive
          </TabsTrigger>
          <TabsTrigger value="transcription" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Transcrição Manual
          </TabsTrigger>
          <TabsTrigger value="csv" className="flex items-center gap-2">
            <Table className="h-4 w-4" />
            Importar CSV
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drive">
          <GoogleDriveIntegration userId={user?.id} />
        </TabsContent>

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
// GOOGLE DRIVE INTEGRATION (wizard style)
// ==========================================

type DriveStep = 'inicio' | 'permissoes' | 'conectado'

interface ImportedFile {
  id: string
  name: string
  mimeType: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  result?: Record<string, unknown>
  error?: string
  importedAt: string
}

function GoogleDriveIntegration({ userId }: { userId?: string }) {
  const googleConfigured = drive.isConfigured()
  const [step, setStep] = useState<DriveStep>(drive.hasValidToken() ? 'conectado' : 'inicio')
  const [isImporting, setIsImporting] = useState(false)
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>(() => {
    if (!userId) return []
    try {
      const stored = localStorage.getItem(`bethel-drive-files-${userId}`)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false)
  const [selectedAnalysis, setSelectedAnalysis] = useState<Record<string, unknown> | null>(null)

  const stepIndex = step === 'inicio' ? 0 : step === 'permissoes' ? 1 : 2

  // If Google credentials are not configured, show a message instead of the wizard
  if (!googleConfigured) {
    return (
      <Card>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Cloud className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Integração Google Drive</h3>
              <p className="text-sm text-muted-foreground">Conecte sua conta para importar transcrições automaticamente</p>
            </div>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Integração não configurada</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                A integração com Google Drive ainda não foi configurada neste ambiente.
                O administrador precisa adicionar as credenciais do Google nas variáveis de ambiente do deploy.
              </p>
            </div>
            <div className="bg-muted rounded-lg p-4 text-left text-xs font-mono max-w-sm w-full space-y-1">
              <p className="text-muted-foreground"># Variáveis necessárias no Vercel:</p>
              <p>VITE_GOOGLE_CLIENT_ID=seu_client_id</p>
              <p>VITE_GOOGLE_API_KEY=sua_api_key</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Save files to localStorage when they change
  const saveFiles = (files: ImportedFile[]) => {
    setImportedFiles(files)
    if (userId) {
      localStorage.setItem(`bethel-drive-files-${userId}`, JSON.stringify(files.slice(0, 100)))
    }
  }

  // Step 1 → 2: Start connection
  const handleStartConnection = async () => {
    setStep('permissoes')
    try {
      await drive.authorize()
      setStep('conectado')
      toast.success('Google Drive conectado com sucesso!')
    } catch (error) {
      setStep('inicio')
      toast.error(error instanceof Error ? error.message : 'Erro ao conectar')
    }
  }

  // Disconnect
  const handleDisconnect = () => {
    drive.clearToken()
    setStep('inicio')
    toast.success('Google Drive desconectado')
  }

  // Open picker and import selected files
  const handleImportFiles = async () => {
    setIsImporting(true)
    try {
      const selectedFiles = await drive.openPicker()
      if (selectedFiles.length === 0) {
        setIsImporting(false)
        return
      }

      toast.info(`Processando ${selectedFiles.length} arquivo(s)...`)

      const token = await drive.authorize()
      const newFiles: ImportedFile[] = []

      for (const file of selectedFiles) {
        const importedFile: ImportedFile = {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          status: 'processing',
          importedAt: new Date().toISOString()
        }

        try {
          // Download content
          const content = await drive.downloadFileContent(file.id, file.mimeType, token)

          if (!content.trim()) {
            importedFile.status = 'error'
            importedFile.error = 'Arquivo vazio'
            newFiles.push(importedFile)
            continue
          }

          const isCSV = file.name.endsWith('.csv') || file.mimeType === 'text/csv'

          if (isCSV) {
            importedFile.status = 'completed'
            importedFile.result = {
              type: 'csv',
              row_count: content.split('\n').filter(l => l.trim()).length - 1
            }
          } else {
            // Analyze with AI
            try {
              const analysis = await analyzeCallTranscript(content)
              importedFile.status = 'completed'
              importedFile.result = analysis as unknown as Record<string, unknown>
            } catch (err) {
              importedFile.status = 'error'
              importedFile.error = err instanceof Error ? err.message : 'Erro na análise IA'
            }
          }

          // Try to save to Supabase
          if (userId && importedFile.status === 'completed' && importedFile.result && !('type' in importedFile.result && importedFile.result.type === 'csv')) {
            try {
              await supabase.from('drive_sync_files').upsert({
                closer_id: userId,
                drive_file_id: file.id,
                file_name: file.name,
                mime_type: file.mimeType,
                status: importedFile.status,
                result_type: 'transcription',
                result_data: importedFile.result,
                synced_at: importedFile.importedAt,
                processed_at: new Date().toISOString()
              }, { onConflict: 'closer_id,drive_file_id' })
            } catch { /* table may not exist */ }
          }
        } catch (err) {
          importedFile.status = 'error'
          importedFile.error = err instanceof Error ? err.message : 'Erro ao processar'
        }

        newFiles.push(importedFile)
      }

      // Merge with existing files (avoid duplicates)
      const existingIds = new Set(importedFiles.map(f => f.id))
      const merged = [...newFiles.filter(f => !existingIds.has(f.id)), ...importedFiles]
      saveFiles(merged)

      const successCount = newFiles.filter(f => f.status === 'completed').length
      const errorCount = newFiles.filter(f => f.status === 'error').length

      if (successCount > 0) toast.success(`${successCount} arquivo(s) importado(s) com sucesso!`)
      if (errorCount > 0) toast.warning(`${errorCount} arquivo(s) com erro`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Token expirado')) {
        setStep('inicio')
      }
      toast.error(error instanceof Error ? error.message : 'Erro ao importar')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Main Card */}
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Cloud className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Integração Google Drive</h3>
              <p className="text-sm text-muted-foreground">Conecte sua conta para importar transcrições automaticamente</p>
            </div>
          </div>
        </div>

        <CardContent className="p-6">
          {/* Stepper */}
          <div className="flex items-center justify-center gap-0 mb-8">
            {[
              { label: 'Início', index: 0 },
              { label: 'Permissões', index: 1 },
              { label: 'Conectar', index: 2 }
            ].map((s, i) => (
              <div key={s.label} className="flex items-center">
                {i > 0 && (
                  <div className={`w-16 sm:w-24 h-px ${stepIndex > i - 1 ? 'bg-blue-600' : 'bg-border'}`} />
                )}
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    stepIndex >= s.index
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {stepIndex > s.index ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      s.index + 1
                    )}
                  </div>
                  <span className={`text-sm font-medium hidden sm:inline ${
                    stepIndex >= s.index ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Step Content */}
          {step === 'inicio' && (
            <div className="text-center space-y-8">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Comece a importar suas transcrições
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Conecte seu Google Drive para importar os documentos de transcrição das suas calls.
                </p>
              </div>

              {/* Feature cards */}
              <div className="space-y-3 max-w-lg mx-auto text-left">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Importação Automática</p>
                    <p className="text-sm text-muted-foreground">Detectamos novos documentos e importamos automaticamente</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Acesso Somente Leitura</p>
                    <p className="text-sm text-muted-foreground">Nunca modificamos ou deletamos seus arquivos</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">100% Seguro</p>
                    <p className="text-sm text-muted-foreground">Você pode revogar o acesso a qualquer momento</p>
                  </div>
                </div>
              </div>

              {/* CTA */}
              <Button
                size="lg"
                className="w-full max-w-lg h-12 bg-blue-600 hover:bg-blue-700 text-base font-semibold"
                onClick={handleStartConnection}
              >
                Começar Conexão
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {step === 'permissoes' && (
            <div className="text-center space-y-6 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Conectando ao Google Drive...
                </h2>
                <p className="text-muted-foreground">
                  Autorize o acesso na janela do Google que abriu.
                </p>
              </div>
            </div>
          )}

          {step === 'conectado' && (
            <div className="space-y-6">
              {/* Connected status */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Google Drive Conectado</p>
                    <p className="text-sm text-muted-foreground">Pronto para importar seus arquivos</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-muted-foreground hover:text-foreground">
                  Desconectar
                </Button>
              </div>

              {/* Import button */}
              <Button
                size="lg"
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-base font-semibold"
                onClick={handleImportFiles}
                disabled={isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <FolderOpen className="mr-2 h-5 w-5" />
                    Selecionar Arquivos do Drive
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Selecione transcrições (.txt, .md, Google Docs) ou planilhas (.csv) do seu Drive
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Imported files history */}
      {importedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Arquivos Importados
            </CardTitle>
            <CardDescription>
              {importedFiles.length} arquivo(s) importado(s) do Google Drive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {importedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(file.importedAt).toLocaleString('pt-BR')}
                        {file.result && 'type' in file.result && file.result.type === 'csv' && ' · CSV detectado'}
                        {file.result && !('type' in file.result) && ' · Transcrição analisada'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <FileStatusBadge status={file.status} />
                    {file.status === 'completed' && file.result && !('type' in file.result && file.result.type === 'csv') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedAnalysis(file.result!)
                          setShowAnalysisDialog(true)
                        }}
                        title="Ver análise"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Dialog */}
      <AnalysisResultDialog
        open={showAnalysisDialog}
        onOpenChange={setShowAnalysisDialog}
        result={selectedAnalysis}
      />
    </div>
  )
}

function FileStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Importado
        </Badge>
      )
    case 'processing':
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Processando
        </Badge>
      )
    case 'error':
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle className="h-3 w-3 mr-1" />
          Erro
        </Badge>
      )
    default:
      return (
        <Badge variant="outline">Pendente</Badge>
      )
  }
}

// ==========================================
// ANALYSIS RESULT DIALOG
// ==========================================

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

          {summary && (
            <div>
              <h4 className="font-medium mb-1">Resumo</h4>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{summary}</p>
            </div>
          )}

          {keyPoints.length > 0 && (
            <AnalysisList title="Pontos Principais" items={keyPoints} icon={<CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />} />
          )}
          {objections.length > 0 && (
            <AnalysisList title="Objeções" items={objections} icon={<AlertCircle className="h-4 w-4 text-orange-500 dark:text-orange-400" />} />
          )}
          {buyingSignals.length > 0 && (
            <AnalysisList title="Sinais de Compra" items={buyingSignals} icon={<Sparkles className="h-4 w-4 text-blue-500 dark:text-blue-400" />} />
          )}
          {riskFactors.length > 0 && (
            <AnalysisList title="Fatores de Risco" items={riskFactors} icon={<AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />} />
          )}
          {recommendedActions.length > 0 && (
            <AnalysisList title="Ações Recomendadas" items={recommendedActions} icon={<ArrowRight className="h-4 w-4 text-primary" />} />
          )}
          {nextSteps.length > 0 && (
            <AnalysisList title="Próximos Passos" items={nextSteps} icon={<ArrowRight className="h-4 w-4 text-primary" />} />
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AnalysisList({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-medium mb-1">{title}</h4>
      <ul className="text-sm text-muted-foreground space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0">{icon}</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ==========================================
// TRANSCRIPTION IMPORT (Manual)
// ==========================================

function TranscriptionImport({ userId }: { userId?: string }) {
  const [transcript, setTranscript] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedCallId, setSelectedCallId] = useState('')
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!transcript.trim()) throw new Error('Digite ou carregue uma transcrição')
      return await analyzeCallTranscript(transcript)
    },
    onSuccess: async (analysis) => {
      setAnalysisResult(analysis as unknown as Record<string, unknown>)
      setShowResultDialog(true)

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
    reader.onerror = () => toast.error('Erro ao ler o arquivo')
    reader.readAsText(file)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  return (
    <div className="grid gap-6 lg:grid-cols-3">
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
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />
                    Carregar arquivo
                  </Button>
                  {transcript && (
                    <Button variant="ghost" size="sm" onClick={() => setTranscript('')}>
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
      </div>

      <AnalysisResultDialog
        open={showResultDialog}
        onOpenChange={setShowResultDialog}
        result={analysisResult}
      />
    </div>
  )
}

// ==========================================
// CSV IMPORT
// ==========================================

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
  'lead': 'lead', 'novo': 'lead', 'new': 'lead',
  'contactado': 'contacted', 'contacted': 'contacted', 'em contato': 'contacted',
  'negociando': 'negotiating', 'negotiating': 'negotiating', 'em negociação': 'negotiating',
  'fechado': 'closed_won', 'won': 'closed_won', 'ganho': 'closed_won', 'closed_won': 'closed_won',
  'perdido': 'closed_lost', 'lost': 'closed_lost', 'closed_lost': 'closed_lost'
}

const sourceMap: Record<string, string> = {
  'organic': 'organic', 'orgânico': 'organic',
  'referral': 'referral', 'indicação': 'referral',
  'ads': 'ads', 'anúncios': 'ads',
  'event': 'event', 'evento': 'event',
  'other': 'other', 'outro': 'other'
}

interface CsvData {
  headers: string[]
  rows: string[][]
}

type CsvStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'done'

function CsvImport({ userId }: { userId?: string }) {
  const [step, setStep] = useState<CsvStep>('upload')
  const [csvData, setCsvData] = useState<CsvData | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<number, ClientField>>({})
  const [importResults, setImportResults] = useState<{ success: number; errors: string[]; skipped?: number }>({ success: 0, errors: [] })
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const autoMapColumns = useCallback((headers: string[]) => {
    const mapping: Record<number, ClientField> = {}
    const headerMap: Record<string, ClientField> = {
      'nome': 'name', 'name': 'name', 'cliente': 'name', 'client': 'name',
      'email': 'email', 'e-mail': 'email',
      'telefone': 'phone', 'phone': 'phone', 'tel': 'phone', 'celular': 'phone', 'whatsapp': 'phone',
      'empresa': 'company', 'company': 'company',
      'status': 'status',
      'origem': 'source', 'source': 'source', 'fonte': 'source',
      'ticket': 'ticket_type', 'tipo': 'ticket_type', 'produto': 'ticket_type', 'product': 'ticket_type',
      'valor entrada': 'entry_value', 'entry value': 'entry_value', 'entrada': 'entry_value',
      'valor venda': 'sale_value', 'sale value': 'sale_value', 'venda': 'sale_value', 'valor': 'sale_value',
      'notas': 'notes', 'notes': 'notes', 'observações': 'notes', 'obs': 'notes'
    }

    headers.forEach((header, index) => {
      const normalized = header.toLowerCase().trim()
      if (headerMap[normalized]) {
        mapping[index] = headerMap[normalized]
      }
    })
    return mapping
  }, [])

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
    reader.onerror = () => toast.error('Erro ao ler o arquivo')
    reader.readAsText(file)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [parseCsv, autoMapColumns])

  const previewData = csvData?.rows.slice(0, 5).map(row => {
    const client: Record<string, string> = {}
    Object.entries(columnMapping).forEach(([colIndex, field]) => {
      if (field !== '__skip__') {
        client[field] = row[parseInt(colIndex)] || ''
      }
    })
    return client
  }) || []

  const hasNameMapping = Object.values(columnMapping).includes('name')

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!csvData || !userId) throw new Error('Dados incompletos')
      if (!hasNameMapping) throw new Error('Mapeie pelo menos a coluna "Nome"')

      setStep('importing')
      let success = 0
      let skipped = 0
      const errors: string[] = []

      // Fetch existing clients for dedup (by email and phone)
      const { data: existingClients } = await supabase
        .from('clients')
        .select('email, phone')
        .eq('closer_id', userId)
      const existingEmails = new Set((existingClients || []).map(c => c.email?.toLowerCase()).filter(Boolean))
      const existingPhones = new Set((existingClients || []).map(c => c.phone?.replace(/\D/g, '')).filter(Boolean))

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

          if (!record.name) {
            errors.push(`Linha ${i + 2}: Nome vazio, pulando`)
            continue
          }
          if (!record.email) record.email = ''
          if (!record.phone) record.phone = ''
          if (!record.status) record.status = 'lead'
          if (!record.source) record.source = 'other'

          // Check for duplicates by email or phone
          const email = (record.email as string).toLowerCase()
          const phone = (record.phone as string).replace(/\D/g, '')
          if (email && existingEmails.has(email)) {
            skipped++
            errors.push(`Linha ${i + 2} (${record.name}): Email "${email}" já existe, pulando`)
            continue
          }
          if (phone && phone.length >= 8 && existingPhones.has(phone)) {
            skipped++
            errors.push(`Linha ${i + 2} (${record.name}): Telefone já existe, pulando`)
            continue
          }

          const { error } = await supabase.from('clients').insert(record)

          if (error) {
            errors.push(`Linha ${i + 2} (${record.name}): ${error.message}`)
          } else {
            success++
            // Add to sets to prevent duplicates within the same CSV
            if (email) existingEmails.add(email)
            if (phone && phone.length >= 8) existingPhones.add(phone)
          }
        } catch (err) {
          errors.push(`Linha ${i + 2}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
        }
      }

      return { success, errors, skipped }
    },
    onSuccess: (results) => {
      if (results) {
        setImportResults(results)
        setStep('done')
        if (results.success > 0) toast.success(`${results.success} clientes importados!`)
        if (results.skipped && results.skipped > 0) toast.info(`${results.skipped} duplicados ignorados`)
        if (results.errors.length > 0 && (!results.skipped || results.errors.length > results.skipped)) toast.warning(`${results.errors.length} erros durante importação`)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
      setStep('mapping')
    }
  })

  const handleReset = () => {
    setStep('upload')
    setCsvData(null)
    setColumnMapping({})
    setImportResults({ success: 0, errors: [] })
  }

  return (
    <div className="space-y-6">
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

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Upload de CSV
            </CardTitle>
            <CardDescription>Selecione um arquivo CSV com os dados dos clientes</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-foreground font-medium mb-1">Clique para selecionar ou arraste o arquivo</p>
              <p className="text-sm text-muted-foreground">CSV separado por vírgula ou ponto-e-vírgula. Máximo 10MB.</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvUpload} />
            <div className="mt-6">
              <h4 className="font-medium text-sm mb-2">Formato esperado:</h4>
              <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto">
                <div className="text-muted-foreground">Nome,Email,Telefone,Empresa,Status,Origem,Valor</div>
                <div className="text-foreground">João Silva,joao@email.com,11999887766,Empresa XYZ,lead,organic,12000</div>
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

      {step === 'mapping' && csvData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Table className="h-5 w-5" />
              Mapeamento de Colunas
            </CardTitle>
            <CardDescription>Associe as colunas do CSV aos campos do sistema. {csvData.rows.length} linhas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {csvData.headers.map((header, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="min-w-[200px]">
                    <Badge variant="outline" className="font-mono">{header}</Badge>
                    {csvData.rows[0]?.[index] && (
                      <span className="text-xs text-muted-foreground ml-2">ex: {csvData.rows[0][index].substring(0, 30)}</span>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Select
                    value={columnMapping[index] || '__skip__'}
                    onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [index]: v as ClientField }))}
                  >
                    <SelectTrigger className="w-[200px] bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(clientFieldLabels).map(([field, label]) => (
                        <SelectItem key={field} value={field}>{label}</SelectItem>
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
              <Button variant="outline" onClick={handleReset}>Voltar</Button>
              <Button onClick={() => setStep('preview')} disabled={!hasNameMapping}>
                <Eye className="h-4 w-4 mr-2" />
                Visualizar prévia
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && csvData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Prévia da Importação</CardTitle>
            <CardDescription>Confira os primeiros 5 registros. Total: {csvData.rows.length}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {Object.entries(columnMapping)
                      .filter(([, field]) => field !== '__skip__')
                      .map(([, field]) => (
                        <th key={field} className="text-left p-2 font-medium text-foreground">{clientFieldLabels[field]}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, i) => (
                    <tr key={i} className="border-b border-border">
                      {Object.entries(columnMapping)
                        .filter(([, field]) => field !== '__skip__')
                        .map(([, field]) => (
                          <td key={field} className="p-2 text-muted-foreground">{row[field] || '-'}</td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {csvData.rows.length > 5 && <p className="text-sm text-muted-foreground">... e mais {csvData.rows.length - 5} registros</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('mapping')}>Voltar ao mapeamento</Button>
              <Button onClick={() => importMutation.mutate()}>
                <Upload className="h-4 w-4 mr-2" />
                Importar {csvData.rows.length} clientes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'importing' && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
            <p className="text-foreground font-medium">Importando clientes...</p>
          </CardContent>
        </Card>
      )}

      {step === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
              Importação Concluída
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResults.success}</p>
                <p className="text-sm text-green-600 dark:text-green-400">Importados</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{importResults.skipped || 0}</p>
                <p className="text-sm text-yellow-600 dark:text-yellow-400">Duplicados</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResults.errors.length - (importResults.skipped || 0)}</p>
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
            <Button onClick={handleReset}>Nova Importação</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

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
