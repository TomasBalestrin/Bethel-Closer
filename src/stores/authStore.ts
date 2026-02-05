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

// Helper: fetch or create profile, ensuring email is always populated
async function fetchOrCreateProfile(sessionUser: { id: string; email?: string; created_at: string }) {
  let profile = null

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', sessionUser.id)
      .maybeSingle()

    if (!error && data) {
      profile = data

      // Auto-populate email if missing in profile
      if (!profile.email && sessionUser.email) {
        try {
          await supabase
            .from('profiles')
            .update({ email: sessionUser.email })
            .eq('user_id', sessionUser.id)
          profile.email = sessionUser.email
        } catch {
          // ignore update error
        }
      }
    } else if (!data) {
      // Profile doesn't exist - create one
      try {
        const newProfile = {
          user_id: sessionUser.id,
          email: sessionUser.email || '',
          name: sessionUser.email?.split('@')[0] || '',
          role: 'closer'
        }
        const { data: created } = await supabase
          .from('profiles')
          .insert(newProfile)
          .select()
          .single()
        profile = created || newProfile
      } catch {
        // Profile creation failed (might be RLS or trigger conflict)
        // Profile creation failed (RLS or trigger conflict) - using defaults
      }
    }
  } catch (e) {
    // Profile fetch failed - will use defaults
  }

  return profile
}

function buildUser(sessionUser: { id: string; email?: string; created_at: string }, profile: Record<string, unknown> | null): User {
  // CRITICAL: profileId is used for all data relationships (calls, clients, etc.)
  // The auth.users.id (sessionUser.id) is ONLY for authentication
  const profileId = (profile?.id as string) || ''

  if (!profileId) {
    console.warn('[AuthStore] No profile ID found - sync operations will fail!')
  }

  return {
    id: sessionUser.id,           // auth.users.id - for authentication only
    profileId: profileId,         // profiles.id - for data relationships
    email: sessionUser.email || '',
    name: (profile?.name as string) || sessionUser.email?.split('@')[0] || '',
    avatar_url: (profile?.avatar_url as string) || undefined,
    role: ((profile?.role as UserRole) || 'closer'),
    created_at: sessionUser.created_at,
    updated_at: (profile?.updated_at as string) || sessionUser.created_at
  }
}

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
            const profile = await fetchOrCreateProfile(session.user)
            const user = buildUser(session.user, profile)

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
                const profile = await fetchOrCreateProfile(session.user)
                const user = buildUser(session.user, profile)

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
          } catch {
            // Profile creation might fail if trigger already created it
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
        profile: state.profile,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)
