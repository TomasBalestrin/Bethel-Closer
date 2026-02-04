import { useState, useCallback, useRef, useEffect } from 'react'
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
  RefreshCw,
  FolderOpen,
  Link,
  Cloud,
  CloudOff,
  Clock,
  Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const { user, profile } = useAuthStore()

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Dados</h1>
        <p className="text-muted-foreground mt-1">
          Conecte seu Google Drive para sincronizar transcrições automaticamente
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
          <GoogleDriveSync userId={user?.id} userName={profile?.name} />
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
// GOOGLE DRIVE SYNC (per-closer)
// ==========================================

interface SyncedFile {
  id: string
  closer_id: string
  drive_file_id: string
  file_name: string
  mime_type: string | null
  status: 'pending' | 'processing' | 'completed' | 'error'
  result_type: string | null
  result_data: Record<string, unknown> | null
  error_message: string | null
  synced_at: string
  processed_at: string | null
}

interface SyncConfig {
  id: string
  closer_id: string
  folder_id: string
  folder_name: string | null
  last_sync_at: string | null
  auto_sync: boolean
}

const SYNC_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes

function getLocalConfigKey(userId: string) {
  return `bethel-drive-config-${userId}`
}

function getLocalFilesKey(userId: string) {
  return `bethel-drive-files-${userId}`
}

function GoogleDriveSync({ userId, userName }: { userId?: string; userName?: string }) {
  const [isConnected, setIsConnected] = useState(drive.hasValidToken())
  const [folderUrlInput, setFolderUrlInput] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false)
  const [selectedAnalysis, setSelectedAnalysis] = useState<Record<string, unknown> | null>(null)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load config from Supabase (with fallback to localStorage per-user)
  const { data: syncConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['drive-sync-config', userId],
    queryFn: async (): Promise<SyncConfig | null> => {
      if (!userId) return null

      // Try Supabase first
      try {
        const { data, error } = await supabase
          .from('drive_sync_config')
          .select('*')
          .eq('closer_id', userId)
          .maybeSingle()

        if (!error && data) return data as SyncConfig
      } catch {
        // Table may not exist yet
      }

      // Fallback to per-user localStorage
      const local = localStorage.getItem(getLocalConfigKey(userId))
      if (local) {
        try {
          return JSON.parse(local) as SyncConfig
        } catch { /* ignore */ }
      }
      return null
    },
    enabled: !!userId,
    retry: false
  })

  // Load synced files (Supabase with localStorage fallback, per-user)
  const { data: syncedFiles = [], refetch: refetchFiles } = useQuery({
    queryKey: ['drive-sync-files', userId],
    queryFn: async (): Promise<SyncedFile[]> => {
      if (!userId) return []

      try {
        const { data, error } = await supabase
          .from('drive_sync_files')
          .select('*')
          .eq('closer_id', userId)
          .order('synced_at', { ascending: false })
          .limit(50)

        if (!error && data) return data as SyncedFile[]
      } catch {
        // Table may not exist
      }

      // Fallback to localStorage
      const local = localStorage.getItem(getLocalFilesKey(userId))
      if (local) {
        try {
          return JSON.parse(local) as SyncedFile[]
        } catch { /* ignore */ }
      }
      return []
    },
    enabled: !!userId,
    retry: false
  })

  // Auto-sync effect: triggers on mount + every SYNC_INTERVAL_MS
  useEffect(() => {
    if (!isConnected || !syncConfig?.folder_id || !syncConfig.auto_sync || !userId) return

    // Sync on mount (small delay to let UI settle)
    const initialSync = setTimeout(() => {
      handleSync()
    }, 1500)

    // Periodic sync
    syncIntervalRef.current = setInterval(() => {
      handleSync()
    }, SYNC_INTERVAL_MS)

    return () => {
      clearTimeout(initialSync)
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, syncConfig?.folder_id, syncConfig?.auto_sync, userId])

  // Connect Google Account (per-closer, each user authenticates with their own Google account)
  const handleConnect = async () => {
    try {
      await drive.authorize()
      setIsConnected(true)
      toast.success('Conta Google conectada!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao conectar')
    }
  }

  // Disconnect
  const handleDisconnect = () => {
    drive.clearToken()
    setIsConnected(false)
    toast.success('Conta Google desconectada')
  }

  // Save folder config (per-closer)
  const handleSaveFolder = async () => {
    if (!folderUrlInput.trim() || !userId) return

    const folderId = drive.extractFolderIdFromUrl(folderUrlInput)
    if (!folderId) {
      toast.error('URL ou ID da pasta inválido')
      return
    }

    try {
      const token = await drive.authorize()
      const folderInfo = await drive.getFolderInfo(folderId, token)

      const config: SyncConfig = {
        id: syncConfig?.id || crypto.randomUUID(),
        closer_id: userId,
        folder_id: folderId,
        folder_name: folderInfo.name,
        last_sync_at: null,
        auto_sync: true
      }

      // Try saving to Supabase (per-closer unique constraint)
      try {
        await supabase
          .from('drive_sync_config')
          .upsert({
            closer_id: userId,
            folder_id: folderId,
            folder_name: folderInfo.name,
            auto_sync: true
          }, { onConflict: 'closer_id' })
      } catch {
        // Table may not exist, use localStorage
      }

      // Always save to per-user localStorage as fallback
      localStorage.setItem(getLocalConfigKey(userId), JSON.stringify(config))

      setFolderUrlInput('')
      refetchConfig()
      toast.success(`Pasta "${folderInfo.name}" configurada para sua conta!`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao acessar pasta')
    }
  }

  // Remove folder config
  const handleRemoveFolder = () => {
    if (!userId) return
    const updatedConfig = { ...syncConfig, folder_id: '', folder_name: null, last_sync_at: null }
    localStorage.setItem(getLocalConfigKey(userId), JSON.stringify(updatedConfig))

    try {
      supabase
        .from('drive_sync_config')
        .update({ folder_id: '', folder_name: null, last_sync_at: null })
        .eq('closer_id', userId)
        .then(() => {})
    } catch { /* ignore */ }

    refetchConfig()
  }

  // Main sync function (processes only this closer's configured folder)
  const handleSync = async () => {
    if (!userId || !syncConfig?.folder_id || isSyncing) return

    setIsSyncing(true)
    setSyncMessage('Verificando novos arquivos...')

    try {
      const token = await drive.authorize()
      setIsConnected(true)

      // List files modified since last sync in this closer's folder
      const files = await drive.listFilesInFolder(
        syncConfig.folder_id,
        token,
        syncConfig.last_sync_at || undefined
      )

      if (files.length === 0) {
        setSyncMessage('Nenhum arquivo novo encontrado')
        setIsSyncing(false)
        return
      }

      // Filter out already synced files for this closer
      const syncedIds = new Set(syncedFiles.map(f => f.drive_file_id))
      const newFiles = files.filter(f => !syncedIds.has(f.id))

      if (newFiles.length === 0) {
        setSyncMessage('Todos os arquivos já foram sincronizados')
        setIsSyncing(false)
        return
      }

      setSyncMessage(`Processando ${newFiles.length} arquivo(s)...`)
      let processed = 0
      let errors = 0
      const newSyncedFiles: SyncedFile[] = []

      for (const file of newFiles) {
        try {
          setSyncMessage(`Processando ${processed + 1}/${newFiles.length}: ${file.name}`)

          // Download file content
          const content = await drive.downloadFileContent(file.id, file.mimeType, token)

          if (!content.trim()) {
            processed++
            continue
          }

          // Determine file type and process
          const isCSV = file.name.endsWith('.csv') || file.mimeType === 'text/csv'

          let resultType = 'transcription'
          let resultData: Record<string, unknown> = {}
          let status: 'completed' | 'error' = 'completed'
          let errorMessage: string | null = null

          if (isCSV) {
            resultType = 'csv_detected'
            resultData = { row_count: content.split('\n').filter(l => l.trim()).length - 1 }
          } else {
            // Text file → AI transcription analysis
            try {
              const analysis = await analyzeCallTranscript(content)
              resultData = analysis as unknown as Record<string, unknown>
              resultType = 'transcription'
            } catch (err) {
              status = 'error'
              errorMessage = err instanceof Error ? err.message : 'Erro na análise IA'
            }
          }

          const syncedFile: SyncedFile = {
            id: crypto.randomUUID(),
            closer_id: userId,
            drive_file_id: file.id,
            file_name: file.name,
            mime_type: file.mimeType,
            status,
            result_type: resultType,
            result_data: resultData,
            error_message: errorMessage,
            synced_at: new Date().toISOString(),
            processed_at: status === 'completed' ? new Date().toISOString() : null
          }

          // Try saving to Supabase
          try {
            await supabase.from('drive_sync_files').upsert({
              closer_id: userId,
              drive_file_id: file.id,
              file_name: file.name,
              mime_type: file.mimeType,
              status,
              result_type: resultType,
              result_data: resultData,
              error_message: errorMessage,
              synced_at: syncedFile.synced_at,
              processed_at: syncedFile.processed_at
            }, { onConflict: 'closer_id,drive_file_id' })
          } catch {
            // Table may not exist, store locally
          }

          newSyncedFiles.push(syncedFile)
          processed++
        } catch (err) {
          errors++
          console.error(`Error processing ${file.name}:`, err)
        }
      }

      // Save to localStorage as fallback
      const allFiles = [...newSyncedFiles, ...syncedFiles].slice(0, 100)
      localStorage.setItem(getLocalFilesKey(userId), JSON.stringify(allFiles))

      // Update last sync time
      const now = new Date().toISOString()
      try {
        await supabase
          .from('drive_sync_config')
          .update({ last_sync_at: now })
          .eq('closer_id', userId)
      } catch { /* fallback below */ }

      const updatedConfig = { ...syncConfig, last_sync_at: now }
      localStorage.setItem(getLocalConfigKey(userId), JSON.stringify(updatedConfig))

      refetchConfig()
      refetchFiles()

      if (errors === 0) {
        setSyncMessage(`${processed} arquivo(s) processado(s) com sucesso`)
        if (processed > 0) toast.success(`${processed} arquivo(s) sincronizado(s)!`)
      } else {
        setSyncMessage(`${processed} processado(s), ${errors} erro(s)`)
        toast.warning(`${processed} processado(s), ${errors} erro(s)`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Token expirado')) {
        setIsConnected(false)
      }
      setSyncMessage('Erro na sincronização')
      toast.error(error instanceof Error ? error.message : 'Erro na sincronização')
    } finally {
      setIsSyncing(false)
    }
  }

  // View analysis result
  const handleViewAnalysis = (file: SyncedFile) => {
    if (file.result_data) {
      setSelectedAnalysis(file.result_data)
      setShowAnalysisDialog(true)
    }
  }

  // Not configured - show setup instructions
  if (!drive.isConfigured()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudOff className="h-5 w-5" />
            Google Drive não configurado
          </CardTitle>
          <CardDescription>
            Configure as credenciais do Google para ativar a sincronização automática
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted rounded-lg p-4 space-y-3 text-sm">
            <p className="font-medium text-foreground">Para configurar:</p>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Acesse o <strong>Google Cloud Console</strong> e crie um projeto</li>
              <li>Ative a <strong>Google Drive API</strong></li>
              <li>Crie credenciais <strong>OAuth 2.0 Client ID</strong> (tipo: Web application)</li>
              <li>Adicione a URL do seu app em <strong>Authorized JavaScript origins</strong></li>
              <li>Crie uma <strong>API Key</strong> e restrinja para Google Drive API</li>
              <li>
                Adicione no arquivo <code className="bg-card px-1 py-0.5 rounded">.env</code>:
                <pre className="bg-card rounded p-2 mt-1 text-xs">
{`VITE_GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=sua-api-key`}
                </pre>
              </li>
              <li>Reinicie o servidor de desenvolvimento</li>
            </ol>
            <p className="text-xs text-muted-foreground mt-3">
              Cada closer conecta sua própria conta Google. Somente os arquivos da pasta configurada por ele serão importados.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Connection & Folder Config */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Connection Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Meu Google Drive
              </CardTitle>
              <CardDescription>
                {userName
                  ? `Conecte sua conta Google pessoal, ${userName}. Apenas seus arquivos serão importados.`
                  : 'Conecte sua conta Google pessoal. Apenas seus arquivos serão importados.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auth status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500 dark:bg-green-400" />
                      <span className="text-sm font-medium text-foreground">Conectado</span>
                    </>
                  ) : (
                    <>
                      <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Desconectado</span>
                    </>
                  )}
                </div>
                {isConnected ? (
                  <Button variant="outline" size="sm" onClick={handleDisconnect}>
                    Desconectar
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleConnect}>
                    <Cloud className="h-4 w-4 mr-2" />
                    Conectar minha conta Google
                  </Button>
                )}
              </div>

              {/* Folder config (only shown when connected) */}
              {isConnected && (
                <div className="space-y-3 pt-2 border-t border-border">
                  {syncConfig?.folder_id ? (
                    <div className="flex items-center justify-between bg-muted rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {syncConfig.folder_name || syncConfig.folder_id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {syncConfig.last_sync_at
                              ? `Última sync: ${new Date(syncConfig.last_sync_at).toLocaleString('pt-BR')}`
                              : 'Nunca sincronizado'}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleRemoveFolder}>
                        Alterar pasta
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>URL ou ID da sua pasta no Google Drive</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="https://drive.google.com/drive/folders/... ou ID"
                          value={folderUrlInput}
                          onChange={(e) => setFolderUrlInput(e.target.value)}
                          className="bg-card"
                        />
                        <Button onClick={handleSaveFolder} disabled={!folderUrlInput.trim()}>
                          <Link className="h-4 w-4 mr-2" />
                          Conectar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cole o link da pasta no seu Drive onde ficam suas transcrições de calls
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sync Controls */}
          {isConnected && syncConfig?.folder_id && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Sincronização Automática
                </CardTitle>
                <div className="flex items-center gap-2">
                  {isSyncing && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Sincronizando
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={isSyncing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sincronizar agora
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {syncMessage && (
                  <p className="text-sm text-muted-foreground mb-3">{syncMessage}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Verifica a cada 2 minutos enquanto a página está aberta
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {syncedFiles.length} arquivo(s) sincronizado(s)
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Synced Files List */}
          {syncedFiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Meus Arquivos Sincronizados</CardTitle>
                <CardDescription>
                  Histórico dos seus arquivos importados do Google Drive
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {syncedFiles.map((file) => (
                    <div
                      key={file.id || file.drive_file_id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {file.file_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(file.synced_at).toLocaleString('pt-BR')}
                            {file.result_type === 'transcription' && ' • Transcrição analisada'}
                            {file.result_type === 'csv_detected' && ' • CSV detectado'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <SyncStatusBadge status={file.status} />
                        {file.status === 'completed' && file.result_type === 'transcription' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewAnalysis(file)}
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
        </div>

        {/* Right sidebar: Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como funciona</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5 flex-shrink-0">1</Badge>
                <p>Conecte <strong>sua conta Google</strong> pessoal</p>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5 flex-shrink-0">2</Badge>
                <p>Selecione a pasta do Drive onde ficam suas transcrições</p>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5 flex-shrink-0">3</Badge>
                <p>O sistema verifica automaticamente por novos arquivos a cada 2 minutos</p>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5 flex-shrink-0">4</Badge>
                <p>Novas transcrições são analisadas automaticamente pela IA</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Importante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Privacidade:</strong>{' '}
                Cada closer conecta sua própria conta Google. Somente os arquivos da sua pasta configurada serão importados.
              </p>
              <p>
                <strong className="text-foreground">Arquivos aceitos:</strong>{' '}
                .txt, .md, Google Docs (análise IA), .csv (detecção)
              </p>
              <p>
                <strong className="text-foreground">Automático:</strong>{' '}
                Basta salvar o arquivo na pasta do Drive. Na próxima verificação ele será processado.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Analysis Dialog */}
      <AnalysisResultDialog
        open={showAnalysisDialog}
        onOpenChange={setShowAnalysisDialog}
        result={selectedAnalysis}
      />
    </div>
  )
}

function SyncStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Processado
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
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      )
  }
}

// ==========================================
// ANALYSIS RESULT DIALOG (shared)
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
// TRANSCRIPTION IMPORT (Manual fallback)
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
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] }>({ success: 0, errors: [] })
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

          if (!record.name) {
            errors.push(`Linha ${i + 2}: Nome vazio, pulando`)
            continue
          }
          if (!record.email) record.email = ''
          if (!record.phone) record.phone = ''
          if (!record.status) record.status = 'lead'
          if (!record.source) record.source = 'other'

          const { error } = await supabase.from('clients').insert(record)

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
        if (results.success > 0) toast.success(`${results.success} clientes importados!`)
        if (results.errors.length > 0) toast.warning(`${results.errors.length} erros durante importação`)
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
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResults.success}</p>
                <p className="text-sm text-green-600 dark:text-green-400">Importados</p>
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
