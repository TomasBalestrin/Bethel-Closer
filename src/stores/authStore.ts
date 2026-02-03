import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/services/supabase'
import type { User, Profile, UserRole } from '@/types'

interface AuthState {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  isAuthenticated: boolean

  // Actions
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (data: Partial<Profile>) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,

      initialize: async () => {
        try {
          set({ isLoading: true })

          const { data: { session } } = await supabase.auth.getSession()

          if (session?.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', session.user.id)
              .single()

            const user: User = {
              id: session.user.id,
              email: session.user.email || '',
              name: profile?.name || session.user.email?.split('@')[0] || '',
              avatar_url: profile?.avatar_url || undefined,
              role: (profile?.role as UserRole) || 'closer',
              created_at: session.user.created_at,
              updated_at: profile?.updated_at || session.user.created_at
            }

            set({
              user,
              profile,
              isAuthenticated: true,
              isLoading: false
            })
          } else {
            set({
              user: null,
              profile: null,
              isAuthenticated: false,
              isLoading: false
            })
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', session.user.id)
                .single()

              const user: User = {
                id: session.user.id,
                email: session.user.email || '',
                name: profile?.name || session.user.email?.split('@')[0] || '',
                avatar_url: profile?.avatar_url || undefined,
                role: (profile?.role as UserRole) || 'closer',
                created_at: session.user.created_at,
                updated_at: profile?.updated_at || session.user.created_at
              }

              set({
                user,
                profile,
                isAuthenticated: true
              })
            } else if (event === 'SIGNED_OUT') {
              set({
                user: null,
                profile: null,
                isAuthenticated: false
              })
            }
          })
        } catch (error) {
          console.error('Failed to initialize auth:', error)
          set({ isLoading: false })
        }
      },

      signIn: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        })

        if (error) {
          throw new Error(error.message)
        }

        await get().initialize()
      },

      signUp: async (email: string, password: string, name: string) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        })

        if (error) {
          throw new Error(error.message)
        }

        if (data.user) {
          // Create profile
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              user_id: data.user.id,
              name,
              email,
              role: 'closer'
            })

          if (profileError) {
            console.error('Failed to create profile:', profileError)
          }
        }

        await get().initialize()
      },

      signOut: async () => {
        const { error } = await supabase.auth.signOut()

        if (error) {
          throw new Error(error.message)
        }

        set({
          user: null,
          profile: null,
          isAuthenticated: false
        })
      },

      updateProfile: async (data: Partial<Profile>) => {
        const { user } = get()

        if (!user) {
          throw new Error('User not authenticated')
        }

        const { error } = await supabase
          .from('profiles')
          .update(data)
          .eq('user_id', user.id)

        if (error) {
          throw new Error(error.message)
        }

        set((state) => ({
          profile: state.profile ? { ...state.profile, ...data } : null,
          user: state.user ? { ...state.user, ...data } : null
        }))
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)
