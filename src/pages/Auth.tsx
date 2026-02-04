import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Mail, Lock, ArrowRight, Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import logo from '@/components/ui/logo.png'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres')
})

type LoginFormData = z.infer<typeof loginSchema>

// Valores da empresa - exibidos como "Valor do dia"
const companyValues = [
  "Você veio pra ser mais.",
  "Nosso propósito de vida é realizado com o trabalho.",
  "Não nos pergunte se fomos capazes, nos dê a missão.",
  "Nossa liderança inspira confiança e ação.",
  "Superamos expectativas e alcançamos resultados acima da média.",
  "Sempre gratos, porém insatisfeitos!",
  "Assumimos a responsabilidade e agimos rapidamente para resolver qualquer desafio.",
  "Nosso ambiente é de frequência elevada, inspirando alta performance e crescimento contínuo."
]

// Pegar o valor do dia baseado no dia do ano
const getDailyValue = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  const dayOfYear = Math.floor(diff / oneDay)
  return companyValues[dayOfYear % companyValues.length]
}

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuthStore()
  const navigate = useNavigate()

  // Pegar o valor do dia
  const dailyValue = getDailyValue()

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  })

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true)
    try {
      await signIn(data.email, data.password)
      toast.success('Login realizado com sucesso!')
      navigate('/dashboard')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao fazer login')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-[#060a14] via-[#0a1225] to-[#0d1a35] p-12 xl:p-16 flex-col relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0">
          <div className="absolute top-10 left-10 w-[500px] h-[500px] bg-blue-600/8 rounded-full filter blur-[150px]" />
          <div className="absolute bottom-10 right-0 w-[600px] h-[600px] bg-indigo-600/8 rounded-full filter blur-[180px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-blue-400/5 rounded-full filter blur-[100px]" />
        </div>

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col flex-1">
          {/* Logo - bigger */}
          <div className="flex items-center gap-4 mb-12">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 rounded-2xl blur-xl" />
              <img src={logo} alt="Bethel Closer" className="h-16 xl:h-20 w-auto relative" />
            </div>
            <div>
              <span className="text-3xl xl:text-4xl font-bold text-white tracking-tight">Bethel Closer</span>
              <p className="text-sm text-blue-400/80 font-medium mt-0.5">Sistema de Gestão</p>
            </div>
          </div>

          {/* Valor do Dia - moved up, right after logo */}
          <div className="mb-12">
            <div className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-sm border border-white/10 rounded-2xl p-8">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Quote className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Valor do dia</p>
                  <p className="text-white text-xl xl:text-2xl font-medium leading-relaxed italic">
                    "{dailyValue}"
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-5 flex-1">
            <h1 className="text-3xl xl:text-4xl font-bold text-white/90 leading-tight">
              Transformando o empreendedorismo através da{' '}
              <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Educação e Tecnologia.
              </span>
            </h1>
            <p className="text-lg text-white/40 max-w-md">
              E transformar cada empresa em Casa de Deus.
            </p>
          </div>

          {/* Bottom decorative line */}
          <div className="relative z-10 flex items-center gap-4 text-white/20 text-sm">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <span>Bethel Group</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-8 bg-background relative">
        {/* Subtle background pattern for light side */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }} />

        <div className="w-full max-w-[420px] relative z-10">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-10">
            <img src={logo} alt="Bethel Closer" className="h-14 w-auto" />
            <span className="text-2xl font-bold">Bethel Closer</span>
          </div>

          {/* Welcome text */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2">Bem-vindo de volta</h2>
            <p className="text-muted-foreground">
              Entre na sua conta para continuar
            </p>
          </div>

          {/* Mobile Valor do Dia */}
          <div className="lg:hidden mb-8">
            <div className="bg-muted/50 border border-border rounded-xl p-5">
              <div className="flex items-start gap-3">
                <Quote className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Valor do dia</p>
                  <p className="text-foreground text-sm italic leading-relaxed">"{dailyValue}"</p>
                </div>
              </div>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-11 h-12 bg-muted/30 border-border/50 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all rounded-xl"
                  {...loginForm.register('email')}
                />
              </div>
              {loginForm.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {loginForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-11 h-12 bg-muted/30 border-border/50 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all rounded-xl"
                  {...loginForm.register('password')}
                />
              </div>
              {loginForm.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {loginForm.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-[#0a1225] via-[#131f42] to-[#1a237e] hover:shadow-lg hover:shadow-blue-900/20 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 text-base font-semibold rounded-xl"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Não tem uma conta? Fale com seu administrador.
          </p>
        </div>
      </div>
    </div>
  )
}
