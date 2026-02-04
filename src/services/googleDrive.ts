// Google Drive API Service
// Uses Google Identity Services (GIS) for OAuth2 and Drive API v3 REST endpoints

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || ''
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

// ==========================================
// Types
// ==========================================

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime: string
  createdTime: string
  webViewLink?: string
}

export interface DriveFolder {
  id: string
  name: string
}

// ==========================================
// Script Loading
// ==========================================

let gisLoaded = false
let gisLoadPromise: Promise<void> | null = null

function loadGIS(): Promise<void> {
  if (gisLoaded) return Promise.resolve()
  if (gisLoadPromise) return gisLoadPromise

  gisLoadPromise = new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      gisLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      gisLoaded = true
      resolve()
    }
    script.onerror = () => reject(new Error('Falha ao carregar Google Identity Services'))
    document.head.appendChild(script)
  })

  return gisLoadPromise
}

// ==========================================
// Auth
// ==========================================

let currentAccessToken: string | null = null
let tokenExpiry: number = 0

export function isConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID && !!GOOGLE_API_KEY
}

export function hasValidToken(): boolean {
  return !!currentAccessToken && Date.now() < tokenExpiry
}

export function getAccessToken(): string | null {
  if (hasValidToken()) return currentAccessToken
  return null
}

export function clearToken(): void {
  currentAccessToken = null
  tokenExpiry = 0
}

export async function authorize(): Promise<string> {
  if (hasValidToken()) return currentAccessToken!

  if (!GOOGLE_CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID não configurado')
  }

  await loadGIS()

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services não carregou corretamente'))
      return
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error))
          return
        }
        currentAccessToken = response.access_token
        // Token expires in ~3600s, set expiry with 5min buffer
        tokenExpiry = Date.now() + (response.expires_in - 300) * 1000
        resolve(response.access_token)
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error_callback: (error: any) => {
        reject(new Error(error.message || 'Erro na autenticação Google'))
      }
    })

    tokenClient.requestAccessToken()
  })
}

// ==========================================
// Drive API Methods
// ==========================================

async function driveRequest(endpoint: string, token: string): Promise<Response> {
  const separator = endpoint.includes('?') ? '&' : '?'
  const url = endpoint.startsWith('http')
    ? `${endpoint}${separator}key=${GOOGLE_API_KEY}`
    : `${DRIVE_API}${endpoint}${separator}key=${GOOGLE_API_KEY}`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })

  if (!response.ok) {
    if (response.status === 401) {
      clearToken()
      throw new Error('Token expirado. Reconecte sua conta Google.')
    }
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(error.error?.message || `Drive API error: ${response.status}`)
  }

  return response
}

export async function getFolderInfo(folderId: string, token: string): Promise<DriveFolder> {
  const response = await driveRequest(
    `/files/${folderId}?fields=id,name&supportsAllDrives=true`,
    token
  )
  return response.json()
}

export async function listFilesInFolder(
  folderId: string,
  token: string,
  modifiedAfter?: string
): Promise<DriveFile[]> {
  let query = `'${folderId}' in parents and trashed = false`
  if (modifiedAfter) {
    query += ` and modifiedTime > '${modifiedAfter}'`
  }

  // Only fetch text-based files we can process
  const mimeFilter = [
    "mimeType = 'text/plain'",
    "mimeType = 'text/csv'",
    "mimeType = 'text/markdown'",
    "mimeType = 'application/vnd.google-apps.document'",
    "mimeType contains 'text/'",
  ].join(' or ')
  query += ` and (${mimeFilter})`

  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: '100',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  })

  const response = await driveRequest(`/files?${params}`, token)
  const data = await response.json()
  return data.files || []
}

export async function downloadFileContent(fileId: string, mimeType: string, token: string): Promise<string> {
  // Google Docs need to be exported as plain text
  if (mimeType === 'application/vnd.google-apps.document') {
    const response = await driveRequest(
      `/files/${fileId}/export?mimeType=text/plain`,
      token
    )
    return response.text()
  }

  // Regular files can be downloaded directly
  const response = await driveRequest(
    `/files/${fileId}?alt=media`,
    token
  )
  return response.text()
}

// ==========================================
// Utility: extract folder ID from URL
// ==========================================

export function extractFolderIdFromUrl(input: string): string {
  const trimmed = input.trim()

  // Already a plain ID (no slashes, no URLs)
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed) && !trimmed.includes('/')) {
    return trimmed
  }

  // Google Drive folder URL patterns:
  // https://drive.google.com/drive/folders/FOLDER_ID
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID
  // https://drive.google.com/drive/folders/FOLDER_ID?...
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]

  // If nothing matched, treat the whole thing as an ID
  return trimmed
}
