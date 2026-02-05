import { authorize, authorizeSilent, downloadFileContent, autoDetectFolder, listFilesInFolder } from './googleDrive'
import type { DriveFile, ListFilesOptions } from './googleDrive'
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
  errors: SyncError[]
}

export interface SyncError {
  fileName: string
  error: string
  detail?: string
  phase: 'download' | 'insert' | 'analysis' | 'other'
}

// ── Drive config persistence ──

const STORAGE_KEY = 'bethel_drive_config'

export interface DriveConfig {
  folderId: string | null
  folderName: string | null
  connected: boolean
  lastSync: string | null
  connectedAt: string | null
  fileType: string | null    // MIME type filter, e.g., 'application/vnd.google-apps.document'
  namePattern: string | null // DEPRECATED — kept for migration
  namePatterns: string[]     // Wildcard patterns: "Transcript", "Transcrição*", "*call*"
}

function getConfig(): DriveConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Migrate old single namePattern → namePatterns array
      if (!parsed.namePatterns) {
        parsed.namePatterns = parsed.namePattern ? [parsed.namePattern] : []
      }
      return parsed
    }
  } catch {
    // corrupt data
  }
  return {
    folderId: null,
    folderName: null,
    connected: false,
    lastSync: null,
    connectedAt: null,
    fileType: null,
    namePattern: null,
    namePatterns: []
  }
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

// ── Public API for Drive config ──

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

export function updateDriveConfig(updates: Partial<DriveConfig>): void {
  saveConfig(updates)
}

export function disconnectDrive(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Already-imported file tracking ──

async function getImportedFileIds(profileId: string): Promise<Set<string>> {
  console.log('[DriveSync] Checking imported files for profileId:', profileId)

  if (!profileId) {
    console.error('[DriveSync] No profileId provided - cannot check imported files')
    return new Set()
  }

  const { data, error } = await supabase
    .from('calls')
    .select('recording_url')
    .eq('closer_id', profileId)
    .like('recording_url', 'drive://%')

  if (error) {
    console.error('[DriveSync] Failed to get imported file IDs:', error)
    // Return empty set to allow sync to continue (will re-import duplicates worst case)
    return new Set()
  }

  const ids = new Set<string>()
  data?.forEach(call => {
    if (call.recording_url?.startsWith('drive://')) {
      ids.add(call.recording_url.replace('drive://', ''))
    }
  })

  console.log('[DriveSync] Found', ids.size, 'already imported files')
  return ids
}

// ── AI analysis helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deriveResultStatus(analysis: Record<string, any>): CallResultStatus {
  if (analysis.identificacao?.houve_venda === 'sim') {
    return 'vendida'
  }
  const leadStatus = analysis.plano_de_acao_direto?.proxima_acao_com_lead?.status
  if (leadStatus === 'follow_up') return 'follow_up'
  if (leadStatus === 'desqualificado') return 'perdida'
  if (leadStatus === 'fechado') return 'vendida'
  if (analysis.nota_geral !== undefined) return 'proposta'
  return 'pendente'
}

// ── Connect ──

export async function connectDrive(
  onProgress?: (progress: SyncProgress) => void
): Promise<{ token: string; folderId: string | null; folderName: string | null }> {
  onProgress?.({ status: 'connecting', message: 'Conectando ao Google Drive...' })
  const token = await authorize()

  onProgress?.({ status: 'listing', message: 'Detectando pasta de gravações...' })
  const folder = await autoDetectFolder(token)

  const folderId = folder?.id || null
  const folderName = folder?.name || null

  saveConfig({
    folderId,
    folderName,
    connected: true,
    lastSync: null,
    connectedAt: new Date().toISOString()
  })

  return { token, folderId, folderName }
}

// ── Silent sync ──

export async function trySilentSync(
  closerId: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult | null> {
  if (!isDriveConnected()) return null

  const token = await authorizeSilent()
  if (!token) return null

  return syncFromDrive(closerId, onProgress, token)
}

// ── Wildcard pattern matching ──

/**
 * Match filename against a wildcard pattern (case-insensitive).
 * - "Transcript"    → filename contains "Transcript"
 * - "Transcrição*"  → filename contains something starting with "Transcrição"
 * - "*call*"        → filename contains "call"
 * - "*Transcript"   → filename ends with "Transcript"
 */
export function matchesPattern(fileName: string, pattern: string): boolean {
  const p = pattern.trim()
  if (!p) return true

  // Convert wildcard pattern to regex
  // Escape regex special chars except *
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  // Replace * with .*
  const regexStr = escaped.replace(/\*/g, '.*')

  // If no wildcards, default to "contains" behavior
  const hasWildcard = p.includes('*')
  const finalRegex = hasWildcard ? `^${regexStr}$` : regexStr

  try {
    const re = new RegExp(finalRegex, 'i')
    return re.test(fileName)
  } catch {
    // Fallback to simple includes
    return fileName.toLowerCase().includes(p.toLowerCase())
  }
}

/**
 * Check if a filename matches ANY of the given patterns.
 * Empty patterns array = match all files.
 */
export function matchesAnyPattern(fileName: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return true
  return patterns.some(p => matchesPattern(fileName, p))
}

// ── List files from configured folder with config filters ──

export async function listConfiguredFiles(
  token: string,
  overrides?: Partial<ListFilesOptions>
): Promise<DriveFile[]> {
  const config = getConfig()
  if (!config.folderId) return []

  // Don't send nameContains to API — filter client-side for multi-pattern + wildcard support
  const options: ListFilesOptions = {
    folderId: config.folderId,
    mimeType: config.fileType || undefined,
    ...overrides
  }
  // Remove nameContains from overrides if present — we filter client-side
  delete options.nameContains

  const result = await listFilesInFolder(token, options)

  // Paginate to get all files
  let allFiles = result.files
  let nextToken = result.nextPageToken
  while (nextToken) {
    const more = await listFilesInFolder(token, { ...options, pageToken: nextToken })
    allFiles = [...allFiles, ...more.files]
    nextToken = more.nextPageToken
  }

  // Apply multi-pattern filtering client-side
  const patterns = config.namePatterns
  if (patterns && patterns.length > 0) {
    allFiles = allFiles.filter(f => matchesAnyPattern(f.name, patterns))
  }

  return allFiles
}

// ── Main sync function ──

export async function syncFromDrive(
  closerId: string,
  onProgress?: (progress: SyncProgress) => void,
  existingToken?: string
): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, analyzed: 0, errors: [] }

  try {
    let token: string | undefined = existingToken
    if (!token) {
      onProgress?.({ status: 'connecting', message: 'Conectando ao Google Drive...' })
      // Try silent auth only (no popup) — if it fails, user needs to reconnect manually
      const silentToken = await authorizeSilent()
      if (!silentToken) {
        onProgress?.({ status: 'error', message: 'Sessão expirada. Desconecte e conecte novamente.' })
        result.errors.push({ fileName: '', error: 'Sessão expirada', detail: 'Clique em Desconectar e conecte novamente', phase: 'other' })
        return result
      }
      token = silentToken
    }

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

    if (!folderId) {
      onProgress?.({ status: 'error', message: 'Nenhuma pasta configurada. Configure uma pasta primeiro.' })
      result.errors.push({ fileName: '', error: 'Nenhuma pasta configurada', phase: 'other' })
      return result
    }

    onProgress?.({ status: 'listing', message: 'Listando arquivos...' })

    // Use config filters (file type + name pattern)
    const files = await listConfiguredFiles(token, {
      folderId,
      // Only sync files modified after connectedAt (auto-sync behavior)
      modifiedAfter: config.connectedAt || undefined
    })

    if (files.length === 0) {
      onProgress?.({ status: 'done', message: 'Nenhum arquivo novo encontrado' })
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

        let content: string
        try {
          content = await downloadFileContent(file.id, file.mimeType, token)
        } catch (dlError) {
          result.errors.push({
            fileName: file.name,
            error: 'Falha ao baixar arquivo',
            detail: dlError instanceof Error ? dlError.message : String(dlError),
            phase: 'download'
          })
          continue
        }

        if (!content || content.trim().length < 50) {
          result.errors.push({
            fileName: file.name,
            error: 'Conteúdo muito curto ou vazio',
            detail: `O arquivo tem apenas ${content?.trim().length || 0} caracteres. Mínimo necessário: 50.`,
            phase: 'download'
          })
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
          result.errors.push({
            fileName: file.name,
            error: 'Falha ao salvar no banco de dados',
            detail: insertError.message + (insertError.details ? ` | ${insertError.details}` : ''),
            phase: 'insert'
          })
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

          console.log('[DriveSync] Analysis complete for', file.name, '- nota:', analysis.nota_geral, '- updating call:', callData.id)

          const { error: updateError } = await supabase
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

          if (updateError) {
            console.error('[DriveSync] Failed to update call with analysis:', updateError)
            result.errors.push({
              fileName: file.name,
              error: 'Falha ao salvar análise',
              detail: updateError.message,
              phase: 'analysis'
            })
          } else {
            console.log('[DriveSync] Successfully saved analysis for call:', callData.id)
            result.analyzed++
          }
        } catch (aiError) {
          result.errors.push({
            fileName: file.name,
            error: 'Falha na análise de IA',
            detail: aiError instanceof Error ? aiError.message : String(aiError),
            phase: 'analysis'
          })
        }
      } catch (fileError) {
        result.errors.push({
          fileName: file.name,
          error: 'Erro inesperado',
          detail: fileError instanceof Error ? fileError.message : String(fileError),
          phase: 'other'
        })
      }
    }

    saveConfig({ connected: true, lastSync: new Date().toISOString() })

    onProgress?.({
      status: 'done',
      message: `Concluído! ${result.imported} importados, ${result.analyzed} analisados`,
      current: newFiles.length,
      total: newFiles.length
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    result.errors.push({ fileName: '', error: msg, phase: 'other' })
    onProgress?.({ status: 'error', message: msg })
  }

  return result
}

// ── Import specific files (historical / manual selection) ──

export async function importSpecificFiles(
  closerId: string,
  files: DriveFile[],
  token: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, analyzed: 0, errors: [] }

  const importedIds = await getImportedFileIds(closerId)
  const newFiles = files.filter(f => !importedIds.has(f.id))

  if (newFiles.length === 0) {
    onProgress?.({ status: 'done', message: 'Todos os arquivos selecionados já foram importados' })
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

      let content: string
      try {
        content = await downloadFileContent(file.id, file.mimeType, token)
      } catch (dlError) {
        result.errors.push({
          fileName: file.name,
          error: 'Falha ao baixar arquivo',
          detail: dlError instanceof Error ? dlError.message : String(dlError),
          phase: 'download'
        })
        continue
      }

      if (!content || content.trim().length < 50) {
        result.errors.push({
          fileName: file.name,
          error: 'Conteúdo muito curto ou vazio',
          detail: `O arquivo tem apenas ${content?.trim().length || 0} caracteres. Mínimo necessário: 50.`,
          phase: 'download'
        })
        continue
      }

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
        result.errors.push({
          fileName: file.name,
          error: 'Falha ao salvar no banco de dados',
          detail: insertError.message,
          phase: 'insert'
        })
        continue
      }

      result.imported++

      try {
        onProgress?.({
          status: 'analyzing',
          message: `Analisando com IA: ${file.name}`,
          current: i + 1,
          total: newFiles.length
        })

        const analysis = await analyzeCallTranscript(content)
        const resultStatus = deriveResultStatus(analysis)

        console.log('[DriveSync] Analysis complete for', file.name, '- nota:', analysis.nota_geral)

        const { error: updateError } = await supabase
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

        if (updateError) {
          console.error('[DriveSync] Failed to update call:', updateError)
          result.errors.push({
            fileName: file.name,
            error: 'Falha ao salvar análise',
            detail: updateError.message,
            phase: 'analysis'
          })
        } else {
          console.log('[DriveSync] Successfully saved analysis')
          result.analyzed++
        }
      } catch (aiError) {
        result.errors.push({
          fileName: file.name,
          error: 'Falha na análise de IA',
          detail: aiError instanceof Error ? aiError.message : String(aiError),
          phase: 'analysis'
        })
      }
    } catch (fileError) {
      result.errors.push({
        fileName: file.name,
        error: 'Erro inesperado',
        detail: fileError instanceof Error ? fileError.message : String(fileError),
        phase: 'other'
      })
    }
  }

  onProgress?.({
    status: 'done',
    message: `Concluído! ${result.imported} importados, ${result.analyzed} analisados`,
    current: newFiles.length,
    total: newFiles.length
  })

  return result
}
