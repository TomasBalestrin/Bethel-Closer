import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/services/supabase'
import type { User, Profile, UserRole } from '@/types'

interface AuthState {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  isAuthenticated: boolean
  isInitialized: boolean

  // Actions
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (data: Partial<Profile>) => Promise<void>
}

let authListenerSetup = false

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,
      isInitialized: false,

      initialize: async () => {
        // Prevent multiple initializations
        if (get().isInitialized) {
          return
        }

        try {
          set({ isLoading: true })

          const { data: { session }, error: sessionError } = await supabase.auth.getSession()

          if (sessionError) {
            console.error('Session error:', sessionError)
            set({
              user: null,
              profile: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true
            })
            return
          }

          if (session?.user) {
            // Try to get profile, but don't fail if it doesn't exist
            let profile = null
            try {
              const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', session.user.id)
                .single()
              profile = data
            } catch (e) {
              console.warn('Could not fetch profile:', e)
            }

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
              isLoading: false,
              isInitialized: true
            })
          } else {
            set({
              user: null,
              profile: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true
            })
          }

          // Setup auth listener only once
          if (!authListenerSetup) {
            authListenerSetup = true
            supabase.auth.onAuthStateChange(async (event, session) => {
              if (event === 'SIGNED_IN' && session?.user) {
                let profile = null
                try {
                  const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .single()
                  profile = data
                } catch (e) {
                  console.warn('Could not fetch profile on auth change:', e)
                }

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
          }
        } catch (error) {
          console.error('Failed to initialize auth:', error)
          set({
            isLoading: false,
            isInitialized: true
          })
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
          try {
            await supabase
              .from('profiles')
              .insert({
                user_id: data.user.id,
                name,
                email,
                role: 'closer'
              })
          } catch (profileError) {
            console.error('Failed to create profile:', profileError)
          }
        }
      },

      signOut: async () => {
        const { error } = await supabase.auth.signOut()

        if (error) {
          throw new Error(error.message)
        }

        set({
          user: null,
          profile: null,
          isAuthenticated: false,
          isInitialized: false
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
