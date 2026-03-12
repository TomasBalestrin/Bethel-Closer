import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, Download, Share, MoreVertical, Plus, Smartphone, Monitor, Apple } from 'lucide-react'

type Platform = 'ios' | 'android' | 'desktop' | 'unknown'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function Install() {
  const [platform, setPlatform] = useState<Platform>('unknown')
  const [isInstalled, setIsInstalled] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(userAgent)
    const isAndroid = /android/.test(userAgent)

    if (isIOS) {
      setPlatform('ios')
    } else if (isAndroid) {
      setPlatform('android')
    } else {
      setPlatform('desktop')
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Listen for beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    setIsInstalling(true)
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice

      if (outcome === 'accepted') {
        setIsInstalled(true)
      }
    } catch (error) {
      console.error('Error installing:', error)
    } finally {
      setIsInstalling(false)
      setDeferredPrompt(null)
    }
  }

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">App Instalado!</CardTitle>
            <CardDescription>
              O Bethel Closer ja esta instalado no seu dispositivo.
              Voce pode acessa-lo diretamente da sua tela inicial.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <a href="/">Abrir App</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4 py-8">
          <img
            src="/logo-bethel-closer.png"
            alt="Bethel Closer"
            className="w-20 h-20 mx-auto rounded-2xl shadow-lg"
          />
          <h1 className="text-3xl font-bold">Instalar Bethel Closer</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Instale o app para acesso rapido, notificacoes e uso offline.
            Funciona como um app nativo!
          </p>

          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="gap-1">
              {platform === 'ios' && <Apple className="w-3 h-3" />}
              {platform === 'android' && <Smartphone className="w-3 h-3" />}
              {platform === 'desktop' && <Monitor className="w-3 h-3" />}
              {platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Desktop'}
            </Badge>
          </div>
        </div>

        {/* Install Button (if available) */}
        {deferredPrompt && (
          <Card className="border-primary">
            <CardContent className="p-6 text-center">
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={handleInstall}
                disabled={isInstalling}
              >
                <Download className="w-5 h-5" />
                {isInstalling ? 'Instalando...' : 'Instalar Agora'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* iOS Instructions */}
        {platform === 'ios' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Apple className="w-5 h-5" />
                Instrucoes para iOS
              </CardTitle>
              <CardDescription>
                Siga os passos abaixo para instalar no iPhone ou iPad
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Toque no botao Compartilhar</h4>
                  <p className="text-sm text-muted-foreground">
                    Na barra inferior do Safari, toque no icone
                  </p>
                  <div className="mt-2 inline-flex items-center justify-center w-10 h-10 bg-muted rounded-lg">
                    <Share className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Adicionar a Tela de Inicio</h4>
                  <p className="text-sm text-muted-foreground">
                    Role a lista e toque em "Adicionar a Tela de Inicio"
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                    <Plus className="w-5 h-5" />
                    <span className="text-sm">Adicionar a Tela de Inicio</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  3
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Confirme a instalacao</h4>
                  <p className="text-sm text-muted-foreground">
                    Toque em "Adicionar" no canto superior direito
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Android Instructions */}
        {platform === 'android' && !deferredPrompt && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Instrucoes para Android
              </CardTitle>
              <CardDescription>
                Siga os passos abaixo para instalar no seu dispositivo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Abra o menu do navegador</h4>
                  <p className="text-sm text-muted-foreground">
                    Toque nos tres pontinhos no canto superior direito
                  </p>
                  <div className="mt-2 inline-flex items-center justify-center w-10 h-10 bg-muted rounded-lg">
                    <MoreVertical className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Instalar aplicativo</h4>
                  <p className="text-sm text-muted-foreground">
                    Toque em "Instalar aplicativo" ou "Adicionar a tela inicial"
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                    <Download className="w-5 h-5" />
                    <span className="text-sm">Instalar aplicativo</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  3
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Confirme a instalacao</h4>
                  <p className="text-sm text-muted-foreground">
                    Toque em "Instalar" na janela de confirmacao
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Desktop Instructions */}
        {platform === 'desktop' && !deferredPrompt && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5" />
                Instrucoes para Desktop
              </CardTitle>
              <CardDescription>
                Siga os passos abaixo para instalar no seu computador
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Procure o icone de instalacao</h4>
                  <p className="text-sm text-muted-foreground">
                    Na barra de endereco do Chrome, procure o icone de instalacao
                  </p>
                  <div className="mt-2 inline-flex items-center justify-center w-10 h-10 bg-muted rounded-lg">
                    <Download className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Clique em Instalar</h4>
                  <p className="text-sm text-muted-foreground">
                    Clique no icone e depois em "Instalar" na janela que aparecer
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                  3
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Pronto!</h4>
                  <p className="text-sm text-muted-foreground">
                    O app sera instalado e voce podera acessa-lo pelo menu de aplicativos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        <Card>
          <CardHeader>
            <CardTitle>Beneficios do App</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Acesso Rapido</span>
                  <p className="text-sm text-muted-foreground">
                    Abra o app direto da sua tela inicial
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Funciona Offline</span>
                  <p className="text-sm text-muted-foreground">
                    Acesse seus dados mesmo sem internet
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Notificacoes</span>
                  <p className="text-sm text-muted-foreground">
                    Receba lembretes de follow-up e alertas
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Tela Cheia</span>
                  <p className="text-sm text-muted-foreground">
                    Experiencia imersiva sem barra do navegador
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-4">
          <Button variant="ghost" asChild>
            <a href="/">Continuar no navegador</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
