// Google Drive API Service
// Uses Google Identity Services (GIS) for OAuth2 + Google Picker for file selection

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '159448469952-1hhh51kvi98r4h030bfcqln544m0lndb.apps.googleusercontent.com'
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyDeqfOPxaGTE0BZxGR46YfipMsFcjddwTM'
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
  modifiedTime?: string
  url?: string
}

// ==========================================
// Script Loading
// ==========================================

let gisLoaded = false
let gisLoadPromise: Promise<void> | null = null
let gapiLoaded = false
let gapiLoadPromise: Promise<void> | null = null

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

function loadGAPI(): Promise<void> {
  if (gapiLoaded) return Promise.resolve()
  if (gapiLoadPromise) return gapiLoadPromise

  gapiLoadPromise = new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="apis.google.com/js/api.js"]')) {
      gapiLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.defer = true
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gapi = (window as any).gapi
      gapi.load('picker', () => {
        gapiLoaded = true
        resolve()
      })
    }
    script.onerror = () => reject(new Error('Falha ao carregar Google API'))
    document.head.appendChild(script)
  })

  return gapiLoadPromise
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
// Google Picker (file browser)
// ==========================================

export async function openPicker(): Promise<DriveFile[]> {
  const token = await authorize()
  await loadGAPI()

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google

    if (!google?.picker) {
      reject(new Error('Google Picker não carregou'))
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callback = (data: any) => {
      if (data.action === google.picker.Action.PICKED) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const files: DriveFile[] = data.docs.map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          mimeType: doc.mimeType,
          size: doc.sizeBytes?.toString(),
          url: doc.url
        }))
        resolve(files)
      } else if (data.action === google.picker.Action.CANCEL) {
        resolve([])
      }
    }

    try {
      const docsView = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMode(google.picker.DocsViewMode.LIST)

      const picker = new google.picker.PickerBuilder()
        .addView(docsView)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback(callback)
        .setTitle('Selecione os arquivos para importar')
        .setLocale('pt-BR')
        .build()

      picker.setVisible(true)
    } catch (err) {
      reject(err)
    }
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
