/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState, useRef, useEffect } from 'react'
import type { AxiosRequestConfig } from 'axios'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'
import { getOAuthState } from '../api'
import {
  buildGitHubOAuthUrl,
  buildDiscordOAuthUrl,
  buildOIDCOAuthUrl,
  buildLinuxDOOAuthUrl,
} from '../lib/oauth'
import type { SystemStatus, CustomOAuthProviderInfo } from '../types'

type LogoutRequestConfig = AxiosRequestConfig & {
  skipErrorHandler?: boolean
}

const DC_OAUTH_SLUG = 'dc'
const DC_OAUTH_CALLBACK_PATH = '/dc-oauth/callback'
const PKCE_STORAGE_PREFIX = 'oauth:pkce'
const PKCE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

const base64UrlEncode = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const createPkcePair = async () => {
  const values = new Uint32Array(64)
  window.crypto.getRandomValues(values)
  const verifier = Array.from(
    values,
    (value) => PKCE_CHARS[value % PKCE_CHARS.length]
  ).join('')
  const data = new TextEncoder().encode(verifier)
  const digest = await window.crypto.subtle.digest('SHA-256', data)
  return {
    verifier,
    challenge: base64UrlEncode(digest),
  }
}

/**
 * Hook for managing OAuth login
 */
export function useOAuthLogin(status: SystemStatus | null) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [githubButtonText, setGithubButtonText] = useState('')
  const [githubButtonDisabled, setGithubButtonDisabled] = useState(false)
  const githubTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { auth } = useAuthStore()

  useEffect(() => {
    setGithubButtonText(t('Continue with GitHub'))

    return () => {
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current)
      }
    }
  }, [t])

  const resetSession = async () => {
    try {
      auth.reset()
    } catch (_error) {
      // ignore store reset errors
    }
    try {
      await api.get('/api/user/logout', {
        skipErrorHandler: true,
      } as LogoutRequestConfig)
    } catch (_error) {
      // ignore logout errors
    }
  }

  const handleGitHubLogin = async () => {
    if (!status?.github_client_id) return
    if (githubButtonDisabled) return

    setIsLoading(true)
    setGithubButtonDisabled(true)
    setGithubButtonText(t('Redirecting to GitHub...'))

    if (githubTimeoutRef.current) {
      clearTimeout(githubTimeoutRef.current)
    }

    githubTimeoutRef.current = setTimeout(() => {
      setIsLoading(false)
      setGithubButtonText(
        t('Request timed out, please refresh and restart GitHub login')
      )
      setGithubButtonDisabled(true)
    }, 20000)

    try {
      await resetSession()
      const state = await getOAuthState()
      if (!state) {
        toast.error(t('Failed to initialize OAuth'))
        if (githubTimeoutRef.current) {
          clearTimeout(githubTimeoutRef.current)
        }
        setIsLoading(false)
        setGithubButtonText(t('Continue with GitHub'))
        setGithubButtonDisabled(false)
        return
      }

      const url = buildGitHubOAuthUrl(status.github_client_id, state)
      window.open(url, '_self')
    } catch (_error) {
      toast.error(t('Failed to start GitHub login'))
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current)
      }
      setIsLoading(false)
      setGithubButtonText(t('Continue with GitHub'))
      setGithubButtonDisabled(false)
    }
  }

  const handleDiscordLogin = async () => {
    if (!status?.discord_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await getOAuthState()
      if (!state) {
        toast.error(t('Failed to initialize OAuth'))
        return
      }

      const url = buildDiscordOAuthUrl(status.discord_client_id, state)
      window.open(url, '_self')
    } catch (_error) {
      toast.error(t('Failed to start Discord login'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleOIDCLogin = async () => {
    if (!status?.oidc_authorization_endpoint || !status?.oidc_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await getOAuthState()
      if (!state) {
        toast.error(t('Failed to initialize OAuth'))
        return
      }

      const url = buildOIDCOAuthUrl(
        status.oidc_authorization_endpoint,
        status.oidc_client_id,
        state
      )
      window.open(url, '_self')
    } catch (_error) {
      toast.error(t('Failed to start OIDC login'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleLinuxDOLogin = async () => {
    if (!status?.linuxdo_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await getOAuthState()
      if (!state) {
        toast.error(t('Failed to initialize OAuth'))
        return
      }

      const url = buildLinuxDOOAuthUrl(status.linuxdo_client_id, state)
      window.open(url, '_self')
    } catch (_error) {
      toast.error(t('Failed to start LinuxDO login'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleTelegramLogin = () => {
    toast.info(t('Telegram login requires widget integration; coming soon'))
  }

  const handleCustomOAuthLogin = async (provider: CustomOAuthProviderInfo) => {
    if (!provider.authorization_endpoint || !provider.client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await getOAuthState()
      if (!state) {
        toast.error(t('Failed to initialize OAuth'))
        return
      }

      const url = new URL(provider.authorization_endpoint)
      const isDcOAuth = provider.slug === DC_OAUTH_SLUG
      const redirectUri = isDcOAuth
        ? `${window.location.origin}${DC_OAUTH_CALLBACK_PATH}`
        : `${window.location.origin}/oauth/${provider.slug}`
      url.searchParams.set('client_id', provider.client_id)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('state', state)
      if (provider.scopes) {
        url.searchParams.set('scope', provider.scopes)
      }
      if (isDcOAuth) {
        const pkce = await createPkcePair()
        window.sessionStorage.setItem(
          `${PKCE_STORAGE_PREFIX}:${provider.slug}:${state}`,
          pkce.verifier
        )
        url.searchParams.set('code_challenge', pkce.challenge)
        url.searchParams.set('code_challenge_method', 'S256')
      }

      window.open(url.toString(), '_self')
    } catch (_error) {
      toast.error(
        t('Failed to start {{provider}} login', { provider: provider.name })
      )
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    githubButtonText,
    githubButtonDisabled,
    handleGitHubLogin,
    handleDiscordLogin,
    handleOIDCLogin,
    handleLinuxDOLogin,
    handleTelegramLogin,
    handleCustomOAuthLogin,
  }
}
