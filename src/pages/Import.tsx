import { useState, useEffect, useCallback, useRef } from 'react'
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
  Zap,
  Search,
  Settings2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
import type { DriveFile, DriveFolder } from '@/services/googleDrive'
import * as sync from '@/services/driveSync'
import type { SyncProgress, SyncResult, SyncError } from '@/services/driveSync'
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
// GOOGLE DRIVE INTEGRATION (folder-based auto-import)
// ==========================================

type DriveStep = 'inicio' | 'conectando' | 'pasta' | 'config' | 'conectado'

const MIME_LABELS: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Docs',
  'text/plain': 'Arquivos de texto (.txt)',
  'all': 'Todos os tipos'
}

// Data de corte padrão para importação automática (arquivos a partir desta data)
const DEFAULT_IMPORT_CUTOFF = '2026-02-01T00:00:00.000Z'

function GoogleDriveIntegration({ userId }: { userId?: string }) {
  const googleConfigured = drive.isConfigured()
  const config = sync.getDriveConfig()

  // Determine initial step
  const getInitialStep = (): DriveStep => {
    if (config.connected && config.folderId) return 'conectado'
    return 'inicio'
  }

  const [step, setStep] = useState<DriveStep>(getInitialStep)
  const [token, setToken] = useState<string | null>(null)

  // Folder selection state
  const [suggestedFolders, setSuggestedFolders] = useState<DriveFolder[]>([])
  const [folderSearch, setFolderSearch] = useState('')
  const [searchResults, setSearchResults] = useState<DriveFolder[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(
    config.folderId && config.folderName ? { id: config.folderId, name: config.folderName } : null
  )
  const [loadingFolders, setLoadingFolders] = useState(false)

  // Config state
  const [fileType, setFileType] = useState(config.fileType || 'application/vnd.google-apps.document')
  // Normalize empty/null fileType to 'all' for Select component (Radix doesn't accept empty string)
  const fileTypeForSelect = fileType || 'all'
  const setFileTypeFromSelect = (v: string) => setFileType(v === 'all' ? '' : v)
  const [namePatterns, setNamePatterns] = useState<string[]>(config.namePatterns || [])
  const [patternInput, setPatternInput] = useState('')

  // Sample files from the selected folder (for showing examples)
  const [sampleFiles, setSampleFiles] = useState<DriveFile[]>([])
  const [loadingSamples, setLoadingSamples] = useState(false)

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const [allErrors, setAllErrors] = useState<SyncError[]>([])
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())

  // Historical files state
  const [historicalFiles, setHistoricalFiles] = useState<DriveFile[]>([])
  const [loadingHistorical, setLoadingHistorical] = useState(false)
  const [selectedHistorical, setSelectedHistorical] = useState<Set<string>>(new Set())
  const [importingHistorical, setImportingHistorical] = useState(false)
  const [showHistorical, setShowHistorical] = useState(false)

  // Settings dialog
  const [showSettings, setShowSettings] = useState(false)

  // Auto-sync on mount when connected
  const autoSyncRan = useRef(false)
  useEffect(() => {
    if (step !== 'conectado' || !userId || autoSyncRan.current) return
    autoSyncRan.current = true
    handleSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, userId])

  // If Google credentials are not configured
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

  // ── Handlers ──

  const handleConnect = async () => {
    setStep('conectando')
    try {
      const authToken = await drive.authorize()
      setToken(authToken)

      // Load suggested folders in background
      setLoadingFolders(true)
      const suggested = await drive.searchFolders(authToken)
      setSuggestedFolders(suggested)
      setLoadingFolders(false)

      // Auto-select best folder if found
      const best = await drive.autoDetectFolder(authToken)
      if (best) {
        setSelectedFolder({ id: best.id, name: best.name })
      }

      setStep('pasta')
    } catch (error) {
      setStep('inicio')
      toast.error(error instanceof Error ? error.message : 'Erro ao conectar')
    }
  }

  const handleOpenFolderPicker = async () => {
    try {
      const authToken = token || await drive.authorize()
      setToken(authToken)
      const folder = await drive.openFolderPicker(authToken)
      if (folder) {
        setSelectedFolder({ id: folder.id, name: folder.name })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao abrir seletor de pastas')
    }
  }

  const handleSearchFolders = async () => {
    if (!token || !folderSearch.trim()) return
    setIsSearching(true)
    try {
      const results = await drive.searchFoldersByName(token, folderSearch.trim())
      setSearchResults(results)
    } catch {
      toast.error('Erro ao buscar pastas')
    } finally {
      setIsSearching(false)
    }
  }

  const handleConfirmFolder = async () => {
    if (!selectedFolder) return
    setStep('config')

    // Load sample files from the selected folder
    if (token && !loadingSamples) {
      setLoadingSamples(true)
      try {
        const { files } = await drive.listFilesInFolder(token, {
          folderId: selectedFolder.id,
          mimeType: fileType || undefined,
          pageSize: 20
        })
        setSampleFiles(files)
      } catch {
        // Non-critical — just won't show samples
      } finally {
        setLoadingSamples(false)
      }
    }
  }

  const handleSaveConfig = () => {
    if (!selectedFolder) return

    sync.updateDriveConfig({
      folderId: selectedFolder.id,
      folderName: selectedFolder.name,
      connected: true,
      connectedAt: DEFAULT_IMPORT_CUTOFF,
      fileType: fileType || null,
      namePattern: null,
      namePatterns
    })

    setStep('conectado')
    toast.success('Google Drive configurado! Sincronizando...')
  }

  const handleSync = async () => {
    if (!userId || isSyncing) return
    setIsSyncing(true)
    setSyncProgress({ status: 'connecting', message: 'Iniciando sincronização...' })

    try {
      const result = await sync.syncFromDrive(
        userId,
        (progress) => setSyncProgress(progress)
      )
      setLastSyncResult(result)
      if (result.errors.length > 0) {
        setAllErrors(prev => [...result.errors, ...prev])
      }
      if (result.imported > 0) {
        toast.success(`${result.imported} arquivo(s) importado(s), ${result.analyzed} analisado(s)`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro na sincronização')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLoadHistorical = async () => {
    if (!userId) return
    setLoadingHistorical(true)
    setShowHistorical(true)
    try {
      const authToken = token || await drive.authorize()
      setToken(authToken)
      const currentConfig = sync.getDriveConfig()

      const files = await sync.listConfiguredFiles(authToken, {
        folderId: currentConfig.folderId!,
        modifiedBefore: currentConfig.connectedAt || undefined
      })
      setHistoricalFiles(files)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar arquivos')
    } finally {
      setLoadingHistorical(false)
    }
  }

  const handleImportHistorical = async () => {
    if (!userId || selectedHistorical.size === 0) return
    setImportingHistorical(true)
    try {
      const authToken = token || await drive.authorize()
      setToken(authToken)
      const filesToImport = historicalFiles.filter(f => selectedHistorical.has(f.id))
      const result = await sync.importSpecificFiles(
        userId,
        filesToImport,
        authToken,
        (progress) => setSyncProgress(progress)
      )
      setLastSyncResult(result)
      if (result.errors.length > 0) {
        setAllErrors(prev => [...result.errors, ...prev])
      }
      if (result.imported > 0) {
        toast.success(`${result.imported} arquivo(s) histórico(s) importado(s)!`)
      }
      setSelectedHistorical(new Set())
      // Reload historical list to update statuses
      handleLoadHistorical()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao importar')
    } finally {
      setImportingHistorical(false)
    }
  }

  const handleDisconnect = () => {
    drive.clearToken()
    sync.disconnectDrive()
    setStep('inicio')
    setToken(null)
    setAllErrors([])
    setLastSyncResult(null)
    autoSyncRan.current = false
    toast.success('Google Drive desconectado')
  }

  const handleUpdateSettings = () => {
    sync.updateDriveConfig({
      fileType: fileType || null,
      namePattern: null,
      namePatterns
    })
    setShowSettings(false)
    toast.success('Configurações salvas!')
  }

  const addPattern = (pattern: string) => {
    const p = pattern.trim()
    if (!p) return
    if (namePatterns.includes(p)) {
      toast.error('Padrão já adicionado')
      return
    }
    setNamePatterns(prev => [...prev, p])
    setPatternInput('')
  }

  const removePattern = (pattern: string) => {
    setNamePatterns(prev => prev.filter(p => p !== pattern))
  }

  const toggleErrorDetail = (idx: number) => {
    setExpandedErrors(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleHistoricalFile = (fileId: string) => {
    setSelectedHistorical(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  // ── Step indicators ──
  const steps = [
    { label: 'Conectar', key: 'inicio' },
    { label: 'Pasta', key: 'pasta' },
    { label: 'Configurar', key: 'config' },
    { label: 'Pronto', key: 'conectado' }
  ]
  const stepKeys = ['inicio', 'conectando', 'pasta', 'config', 'conectado']
  const currentIdx = stepKeys.indexOf(step)

  const currentConfig = sync.getDriveConfig()

  // ── Render ──

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Cloud className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Integração Google Drive</h3>
              <p className="text-sm text-muted-foreground">Importe transcrições automaticamente da sua pasta</p>
            </div>
          </div>
        </div>

        <CardContent className="p-6">
          {/* Stepper */}
          <div className="flex items-center justify-center gap-0 mb-8">
            {steps.map((s, i) => {
              const stepNum = i === 0 ? 0 : i + 1 // skip 'conectando'
              const isActive = currentIdx >= stepNum
              const isDone = currentIdx > stepNum
              return (
                <div key={s.key} className="flex items-center">
                  {i > 0 && (
                    <div className={`w-12 sm:w-20 h-px ${isActive ? 'bg-blue-600' : 'bg-border'}`} />
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'
                    }`}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className={`text-sm font-medium hidden sm:inline ${
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}>{s.label}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Step: Início ── */}
          {step === 'inicio' && (
            <div className="text-center space-y-8">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Importe suas transcrições automaticamente
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Selecione a pasta do Google Drive com suas transcrições. Novos arquivos serão importados automaticamente.
                </p>
              </div>

              <div className="space-y-3 max-w-lg mx-auto text-left">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Selecione uma pasta</p>
                    <p className="text-sm text-muted-foreground">Escolha a pasta onde ficam suas transcrições</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Importação automática</p>
                    <p className="text-sm text-muted-foreground">Novos arquivos são importados e analisados por IA</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Somente leitura</p>
                    <p className="text-sm text-muted-foreground">Nunca modificamos seus arquivos</p>
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full max-w-lg h-12 bg-blue-600 hover:bg-blue-700 text-base font-semibold"
                onClick={handleConnect}
              >
                Conectar Google Drive
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* ── Step: Conectando ── */}
          {step === 'conectando' && (
            <div className="text-center space-y-6 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">Conectando ao Google Drive...</h2>
                <p className="text-muted-foreground">Autorize o acesso na janela do Google que abriu.</p>
              </div>
            </div>
          )}

          {/* ── Step: Pasta ── */}
          {step === 'pasta' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-foreground mb-2">Selecione a pasta de transcrições</h2>
                <p className="text-muted-foreground">Escolha a pasta do Drive onde ficam suas transcrições de ligações</p>
              </div>

              {/* Primary action: Google Picker for folder selection */}
              <div className="flex flex-col items-center gap-4">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full max-w-lg h-14 text-base border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  onClick={handleOpenFolderPicker}
                >
                  <FolderOpen className="mr-3 h-6 w-6 text-blue-600" />
                  Abrir seletor de pastas do Google Drive
                </Button>

                {selectedFolder && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 w-full max-w-lg">
                    <Folder className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <span className="font-medium text-blue-700 dark:text-blue-300">{selectedFolder.name}</span>
                    <CheckCircle2 className="h-4 w-4 text-blue-600 ml-auto flex-shrink-0" />
                  </div>
                )}
              </div>

              {/* Suggested folders (auto-detected) */}
              {loadingFolders ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : suggestedFolders.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Ou selecione uma pasta sugerida:</p>
                  <div className="space-y-2">
                    {suggestedFolders.map(folder => (
                      <FolderItem
                        key={folder.id}
                        folder={folder}
                        isSelected={selectedFolder?.id === folder.id}
                        isSuggested
                        onSelect={() => setSelectedFolder({ id: folder.id, name: folder.name })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Search folders */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Buscar pasta por nome:</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar pasta por nome..."
                      value={folderSearch}
                      onChange={(e) => setFolderSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchFolders()}
                      className="pl-9"
                    />
                  </div>
                  <Button variant="outline" onClick={handleSearchFolders} disabled={isSearching}>
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {searchResults.length > 0 && (
                  <div className="space-y-2 mt-2 max-h-[200px] overflow-y-auto">
                    {searchResults.map(folder => (
                      <FolderItem
                        key={folder.id}
                        folder={folder}
                        isSelected={selectedFolder?.id === folder.id}
                        onSelect={() => setSelectedFolder({ id: folder.id, name: folder.name })}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('inicio')}>Voltar</Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={!selectedFolder}
                  onClick={handleConfirmFolder}
                >
                  Usar pasta: {selectedFolder?.name || '...'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Config ── */}
          {step === 'config' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-foreground mb-2">Configurar importação</h2>
                <p className="text-muted-foreground">
                  Pasta: <span className="font-medium text-foreground">{selectedFolder?.name}</span>
                </p>
              </div>

              <div className="max-w-lg mx-auto space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de arquivo</Label>
                  <Select value={fileTypeForSelect} onValueChange={setFileTypeFromSelect}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="application/vnd.google-apps.document">Google Docs (recomendado)</SelectItem>
                      <SelectItem value="text/plain">Arquivos de texto (.txt)</SelectItem>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Selecione o formato das suas transcrições</p>
                </div>

                <NamePatternsEditor
                  patterns={namePatterns}
                  input={patternInput}
                  onInputChange={setPatternInput}
                  onAdd={addPattern}
                  onRemove={removePattern}
                  sampleFiles={sampleFiles}
                  loadingSamples={loadingSamples}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('pasta')}>Voltar</Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={handleSaveConfig}
                >
                  Conectar e iniciar importação
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Conectado (Dashboard) ── */}
          {step === 'conectado' && (
            <div className="space-y-6">
              {/* Status bar */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Google Drive Conectado</p>
                    <p className="text-sm text-muted-foreground">
                      Pasta: {currentConfig.folderName || '(nenhuma)'}
                      {' · '}
                      {MIME_LABELS[currentConfig.fileType || 'all'] || currentConfig.fileType || 'Todos os tipos'}
                      {currentConfig.namePatterns?.length > 0 && ` · ${currentConfig.namePatterns.length} padrão(ões)`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} title="Configurações">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-muted-foreground hover:text-foreground">
                    Desconectar
                  </Button>
                </div>
              </div>

              {/* Last sync info */}
              {currentConfig.lastSync && (
                <p className="text-xs text-muted-foreground text-center">
                  Última sincronização: {new Date(currentConfig.lastSync).toLocaleString('pt-BR')}
                  {lastSyncResult && ` · ${lastSyncResult.imported} importados, ${lastSyncResult.analyzed} analisados`}
                </p>
              )}

              {/* Sync button + progress */}
              <Button
                size="lg"
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-base font-semibold"
                onClick={handleSync}
                disabled={isSyncing || importingHistorical}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {syncProgress?.message || 'Sincronizando...'}
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-5 w-5" />
                    Sincronizar novos arquivos
                  </>
                )}
              </Button>

              {/* Sync progress bar */}
              {isSyncing && syncProgress?.total && syncProgress.current && (
                <div className="space-y-1">
                  <Progress value={(syncProgress.current / syncProgress.total) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {syncProgress.current}/{syncProgress.total} arquivos
                  </p>
                </div>
              )}

              {/* Historical import section */}
              <div className="border rounded-lg">
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => showHistorical ? setShowHistorical(false) : handleLoadHistorical()}
                >
                  <div className="flex items-center gap-2">
                    {showHistorical ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">Arquivos anteriores à conexão</span>
                  </div>
                  <Badge variant="outline">{historicalFiles.length} arquivos</Badge>
                </button>

                {showHistorical && (
                  <div className="border-t px-4 pb-4">
                    {loadingHistorical ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : historicalFiles.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Nenhum arquivo encontrado anterior à data de conexão
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (selectedHistorical.size === historicalFiles.length) {
                                setSelectedHistorical(new Set())
                              } else {
                                setSelectedHistorical(new Set(historicalFiles.map(f => f.id)))
                              }
                            }}
                          >
                            {selectedHistorical.size === historicalFiles.length ? 'Desmarcar todos' : 'Selecionar todos'}
                          </Button>
                          {selectedHistorical.size > 0 && (
                            <Button
                              size="sm"
                              onClick={handleImportHistorical}
                              disabled={importingHistorical}
                            >
                              {importingHistorical ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4 mr-1" />
                              )}
                              Importar {selectedHistorical.size} selecionado(s)
                            </Button>
                          )}
                        </div>
                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                          {historicalFiles.map(file => (
                            <label
                              key={file.id}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedHistorical.has(file.id)}
                                onChange={() => toggleHistoricalFile(file.id)}
                                className="h-4 w-4 rounded border-border"
                              />
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString('pt-BR') : ''}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Log */}
      {allErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Log de Erros ({allErrors.length})
            </CardTitle>
            <CardDescription>
              Detalhes dos erros ocorridos durante a importação
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allErrors.map((err, idx) => (
                <div key={idx} className="rounded-lg border border-destructive/20 bg-destructive/5 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-destructive/10 transition-colors"
                    onClick={() => toggleErrorDetail(idx)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {err.fileName || 'Erro geral'}
                        </p>
                        <p className="text-xs text-destructive">{err.error}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {err.phase === 'download' ? 'Download' :
                         err.phase === 'insert' ? 'Banco de dados' :
                         err.phase === 'analysis' ? 'Análise IA' : 'Outro'}
                      </Badge>
                      {expandedErrors.has(idx)
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </button>
                  {expandedErrors.has(idx) && err.detail && (
                    <div className="px-3 pb-3 border-t border-destructive/10">
                      <pre className="text-xs text-muted-foreground bg-muted rounded p-2 mt-2 whitespace-pre-wrap break-all font-mono">
                        {err.detail}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-muted-foreground"
              onClick={() => setAllErrors([])}
            >
              <X className="h-4 w-4 mr-1" />
              Limpar log
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações da importação</DialogTitle>
            <DialogDescription>
              Altere o tipo de arquivo e padrão de nome para a importação automática
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de arquivo</Label>
              <Select value={fileTypeForSelect} onValueChange={setFileTypeFromSelect}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="application/vnd.google-apps.document">Google Docs</SelectItem>
                  <SelectItem value="text/plain">Arquivos de texto (.txt)</SelectItem>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NamePatternsEditor
              patterns={namePatterns}
              input={patternInput}
              onInputChange={setPatternInput}
              onAdd={addPattern}
              onRemove={removePattern}
              sampleFiles={[]}
              loadingSamples={false}
              compact
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancelar</Button>
            <Button onClick={handleUpdateSettings}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Folder selection item component
function FolderItem({
  folder,
  isSelected,
  isSuggested,
  onSelect
}: {
  folder: DriveFolder
  isSelected: boolean
  isSuggested?: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
        isSelected
          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/20'
          : 'border-border hover:bg-muted/50'
      }`}
      onClick={onSelect}
    >
      <Folder className={`h-5 w-5 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-muted-foreground'}`} />
      <span className={`font-medium ${isSelected ? 'text-blue-600' : 'text-foreground'}`}>
        {folder.name}
      </span>
      {isSuggested && (
        <Badge variant="secondary" className="ml-auto text-xs">Sugerida</Badge>
      )}
      {isSelected && (
        <CheckCircle2 className="h-4 w-4 text-blue-600 ml-auto" />
      )}
    </button>
  )
}

// Name patterns editor with tags/chips, wildcard support, suggestions
const SUGGESTED_PATTERNS = ['*Transcript', '*Transcrição*', '*Reunião*', '*Call*', '*transcription*']

function NamePatternsEditor({
  patterns,
  input,
  onInputChange,
  onAdd,
  onRemove,
  sampleFiles,
  loadingSamples,
  compact
}: {
  patterns: string[]
  input: string
  onInputChange: (v: string) => void
  onAdd: (p: string) => void
  onRemove: (p: string) => void
  sampleFiles: DriveFile[]
  loadingSamples: boolean
  compact?: boolean
}) {
  const [showHelp, setShowHelp] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onAdd(input)
    }
  }

  // Filter suggestions to only show ones not already added
  const availableSuggestions = SUGGESTED_PATTERNS.filter(s => !patterns.includes(s))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label>Padrões de Nome</Label>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setShowHelp(!showHelp)}
          title="Ajuda sobre padrões"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      {showHelp && (
        <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3 space-y-1">
          <p className="font-medium text-foreground">Como funcionam os padrões:</p>
          <p><code className="bg-background px-1 rounded">Transcript</code> — nome contém "Transcript"</p>
          <p><code className="bg-background px-1 rounded">*Transcript</code> — nome termina com "Transcript"</p>
          <p><code className="bg-background px-1 rounded">Transcrição*</code> — nome começa com "Transcrição"</p>
          <p><code className="bg-background px-1 rounded">*call*</code> — nome contém "call"</p>
          <p className="pt-1">Deixe vazio para importar todos os arquivos da pasta.</p>
        </div>
      )}

      {/* Current patterns as chips */}
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {patterns.map(p => (
            <span
              key={p}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm border border-blue-200 dark:border-blue-800"
            >
              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
              {p}
              <button
                type="button"
                onClick={() => onRemove(p)}
                className="ml-0.5 hover:text-blue-600 dark:hover:text-blue-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Sample file names from folder */}
      {!compact && sampleFiles.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Exemplos de arquivos na pasta:</p>
          <div className="flex flex-wrap gap-1.5">
            {sampleFiles.slice(0, 5).map(f => (
              <button
                key={f.id}
                type="button"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-xs text-muted-foreground hover:text-foreground border border-border transition-colors text-left max-w-full"
                onClick={() => onAdd(`*${f.name.split(' ').slice(-1)[0]}*`)}
                title={`Usar parte do nome: ${f.name}`}
              >
                <FileText className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!compact && loadingSamples && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Carregando exemplos...
        </div>
      )}

      {/* Input + add button */}
      <div className="flex gap-2">
        <Input
          placeholder="Ex: Transcrição* ou *call*"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onAdd(input)}
          disabled={!input.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Suggestions */}
      {availableSuggestions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Sugestões:</p>
          <div className="flex flex-wrap gap-1.5">
            {availableSuggestions.map(s => (
              <button
                key={s}
                type="button"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-xs text-muted-foreground hover:text-foreground border border-border transition-colors"
                onClick={() => onAdd(s)}
              >
                <Plus className="h-3 w-3" />
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {patterns.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhum padrão definido — todos os arquivos da pasta serão importados.
        </p>
      )}
    </div>
  )
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
