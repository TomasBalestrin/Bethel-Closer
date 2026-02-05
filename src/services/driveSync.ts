import { authorize, authorizeSilent, listRecentFiles, downloadFileContent, autoDetectFolder, hasValidToken } from './googleDrive'
import { supabase } from './supabase'
import { analyzeCallTranscript } from './openai'
import type { CallResultStatus } from '@/types'

export interface SyncProgress {
  status: 'idle' | 'connecting' | 'listing' | 'importing' | 'analyzing' | 'done' | 'error'
  message: string
  current?: number
  total?: number
}

export interface SyncResult {
  imported: number
  analyzed: number
  errors: string[]
}

// ── Drive config persistence ──
// Stores: folder_id, folder_name, connected flag, last_sync timestamp

const STORAGE_KEY = 'bethel_drive_config'

interface DriveConfig {
  folderId: string | null
  folderName: string | null
  connected: boolean
  lastSync: string | null
}

function getConfig(): DriveConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    // corrupt data
  }
  return { folderId: null, folderName: null, connected: false, lastSync: null }
}

function saveConfig(updates: Partial<DriveConfig>): void {
  const current = getConfig()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }))
}

// Backwards compat: migrate old key
function migrateOldConfig(): void {
  const oldFolderId = localStorage.getItem('bethel_drive_folder_id')
  if (oldFolderId) {
    saveConfig({ folderId: oldFolderId, connected: true })
    localStorage.removeItem('bethel_drive_folder_id')
  }
}
migrateOldConfig()

// Public API for Drive config
export function getDriveFolderId(): string | null {
  return getConfig().folderId
}

export function setDriveFolderId(folderId: string | null): void {
  saveConfig({ folderId })
}

export function isDriveConnected(): boolean {
  return getConfig().connected
}

export function getDriveConfig(): DriveConfig {
  return getConfig()
}

export function disconnectDrive(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// Get already-imported Drive file IDs
async function getImportedFileIds(closerId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('calls')
    .select('recording_url')
    .eq('closer_id', closerId)
    .like('recording_url', 'drive://%')

  const ids = new Set<string>()
  data?.forEach(call => {
    if (call.recording_url?.startsWith('drive://')) {
      ids.add(call.recording_url.replace('drive://', ''))
    }
  })
  return ids
}

// Derive result_status from AI analysis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deriveResultStatus(analysis: Record<string, any>): CallResultStatus {
  if (analysis.identificacao?.houve_venda === 'sim') {
    return 'vendida'
  }
  const leadStatus = analysis.plano_de_acao_direto?.proxima_acao_com_lead?.status
  if (leadStatus === 'follow_up') return 'follow_up'
  if (leadStatus === 'desqualificado') return 'perdida'
  if (leadStatus === 'fechado') return 'vendida'
  // If analyzed but no clear status, default to proposta
  if (analysis.nota_geral !== undefined) return 'proposta'
  return 'pendente'
}

// Connect to Drive for the first time (with popup) + auto-detect folder
export async function connectDrive(
  onProgress?: (progress: SyncProgress) => void
): Promise<{ token: string; folderId: string | null; folderName: string | null }> {
  onProgress?.({ status: 'connecting', message: 'Conectando ao Google Drive...' })
  const token = await authorize()

  // Auto-detect folder
  onProgress?.({ status: 'listing', message: 'Detectando pasta de gravações...' })
  const folder = await autoDetectFolder(token)

  const folderId = folder?.id || null
  const folderName = folder?.name || null

  // Save config
  saveConfig({
    folderId,
    folderName,
    connected: true,
    lastSync: null
  })

  return { token, folderId, folderName }
}

// Try silent sync (no popup) - returns null if can't auth silently
export async function trySilentSync(
  closerId: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult | null> {
  if (!isDriveConnected()) return null

  const token = await authorizeSilent()
  if (!token) return null

  return syncFromDrive(closerId, onProgress, token)
}

// Main sync function
export async function syncFromDrive(
  closerId: string,
  onProgress?: (progress: SyncProgress) => void,
  existingToken?: string
): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, analyzed: 0, errors: [] }

  try {
    let token = existingToken
    if (!token) {
      onProgress?.({ status: 'connecting', message: 'Conectando ao Google Drive...' })
      token = await authorize()
    }

    // If first sync or no folder configured, auto-detect
    const config = getConfig()
    let folderId = config.folderId

    if (!folderId && config.connected) {
      onProgress?.({ status: 'listing', message: 'Detectando pasta de gravações...' })
      const folder = await autoDetectFolder(token)
      if (folder) {
        folderId = folder.id
        saveConfig({ folderId: folder.id, folderName: folder.name })
      }
    }

    onProgress?.({ status: 'listing', message: 'Listando arquivos recentes...' })
    const files = await listRecentFiles(token, folderId || undefined)

    if (files.length === 0) {
      onProgress?.({ status: 'done', message: 'Nenhum arquivo encontrado no Drive' })
      return result
    }

    onProgress?.({ status: 'listing', message: `${files.length} arquivo(s) encontrados. Verificando duplicatas...` })
    const importedIds = await getImportedFileIds(closerId)
    const newFiles = files.filter(f => !importedIds.has(f.id))

    if (newFiles.length === 0) {
      onProgress?.({ status: 'done', message: 'Todos os arquivos já foram importados' })
      return result
    }

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i]

      try {
        onProgress?.({
          status: 'importing',
          message: `Importando: ${file.name}`,
          current: i + 1,
          total: newFiles.length
        })

        const content = await downloadFileContent(file.id, file.mimeType, token)

        if (!content || content.trim().length < 50) {
          result.errors.push(`${file.name}: conteúdo muito curto`)
          continue
        }

        // Create call record
        const { data: callData, error: insertError } = await supabase
          .from('calls')
          .insert({
            closer_id: closerId,
            scheduled_at: file.modifiedTime || new Date().toISOString(),
            status: 'completed',
            notes: content,
            recording_url: `drive://${file.id}`,
            ai_analysis: { drive_file_id: file.id, drive_file_name: file.name, result_status: 'pendente' }
          })
          .select()
          .single()

        if (insertError) {
          result.errors.push(`${file.name}: ${insertError.message}`)
          continue
        }

        result.imported++

        // Auto-analyze with AI
        try {
          onProgress?.({
            status: 'analyzing',
            message: `Analisando com IA: ${file.name}`,
            current: i + 1,
            total: newFiles.length
          })

          const analysis = await analyzeCallTranscript(content)
          const resultStatus = deriveResultStatus(analysis)

          await supabase
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
                drive_file_id: file.id,
                drive_file_name: file.name
              },
              quality_score: analysis.nota_geral || 0
            })
            .eq('id', callData.id)

          result.analyzed++
        } catch (aiError) {
          result.errors.push(`${file.name}: Erro IA - ${aiError instanceof Error ? aiError.message : 'erro desconhecido'}`)
        }
      } catch (fileError) {
        result.errors.push(`${file.name}: ${fileError instanceof Error ? fileError.message : 'erro desconhecido'}`)
      }
    }

    // Mark drive as connected and save last sync time
    saveConfig({ connected: true, lastSync: new Date().toISOString() })

    onProgress?.({
      status: 'done',
      message: `Concluído! ${result.imported} importados, ${result.analyzed} analisados`,
      current: newFiles.length,
      total: newFiles.length
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    result.errors.push(msg)
    onProgress?.({ status: 'error', message: msg })
  }

  return result
}
