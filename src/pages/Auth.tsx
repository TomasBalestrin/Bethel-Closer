import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Mail, Lock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#0a0f1c] via-[#0d1424] to-[#0a1628] p-12 flex-col justify-between relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500 rounded-full filter blur-[100px]" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-500 rounded-full filter blur-[120px]" />
        </div>

        {/* Content */}
        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <img src={logo} alt="Bethel Closer" className="h-12 w-auto" />
            <span className="text-2xl font-bold text-white">Bethel Closer</span>
          </div>

          {/* Headline */}
          <div className="space-y-6">
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
              Transformando o<br />
              empreendedorismo através da<br />
              <span className="text-blue-400">Educação e Tecnologia.</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              E transformar cada empresa em Casa de Deus.
            </p>
          </div>
        </div>

        {/* Valor do Dia Card */}
        <div className="relative z-10">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <p className="text-sm text-blue-400 mb-2">Valor do dia</p>
            <p className="text-white italic text-lg">"{dailyValue}"</p>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-muted">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <img src={logo} alt="Bethel Closer" className="h-10 w-auto" />
            <span className="text-xl font-bold">Bethel Closer</span>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-bold">Bem-vindo</CardTitle>
              <CardDescription className="text-base">
                Entre na sua conta ou crie uma nova para começar
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10 h-12"
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
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-10 h-12"
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
                  className="w-full h-12 bg-gradient-to-r from-[#0a0f1c] to-[#1a237e] hover:opacity-90 transition-opacity text-base font-medium"
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

              <p className="text-center text-sm text-muted-foreground mt-6">
                Não tem uma conta? Fale com seu administrador.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
