import { useEffect } from 'react'
import { useStore } from '../store'
import { isTauri } from './../lib/platform'

/**
 * Collects the candidate key list from a `GET /api/v1/keys` payload, accepting
 * the shapes the panel may return: `{ data: { items } }`, `{ data: [...] }`,
 * `{ items }` or a bare array.
 */
function pickKeyItems(payload: unknown): unknown[] {
  const asItems = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && 'items' in value && Array.isArray(value.items)) {
      return value.items
    }
    return null
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return asItems(payload.data) ?? asItems(payload) ?? []
  }
  return asItems(payload) ?? []
}

/** Returns the first non-empty string `key` field in the list, if any. */
function findApiKey(items: unknown[]): string | undefined {
  for (const item of items) {
    if (item && typeof item === 'object' && 'key' in item) {
      const value = item.key
      if (typeof value === 'string' && value.length > 0) return value
    }
  }
  return undefined
}

/**
 * Embedded-mode API key bootstrap for sub2api.
 *
 * When the workbench is opened as an iframe inside a sub2api panel, the parent
 * page appends the current user's JWT as a `token` query parameter (see the
 * upstream `buildEmbeddedUrl`). This hook exchanges that token for the user's
 * own API key through `GET /api/v1/keys` and stores it in the active profile,
 * so the workbench is usable without pasting a key manually.
 *
 * Runs on the web build only, once the preset profiles have loaded, and skips
 * the request when the active profile already carries an API key or its base
 * URL is missing. Any failure is logged and leaves manual configuration intact.
 */
export function useEmbeddedApiKey() {
  const profileCount = useStore((s) => s.settings.profiles.length)

  useEffect(() => {
    if (isTauri || !profileCount) return
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) return

    const state = useStore.getState()
    const profiles = state.settings.profiles
    const active = profiles.find((profile) => profile.id === state.settings.activeProfileId) ?? profiles[0]
    if (!active?.baseUrl || active.apiKey) return

    const baseUrl = active.baseUrl.replace(/\/+$/, '')
    let cancelled = false
    void fetch(`${baseUrl}/api/v1/keys`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (cancelled || payload == null) return
        const key = findApiKey(pickKeyItems(payload))
        if (key) useStore.getState().setSettings({ apiKey: key })
      })
      .catch((error) => console.warn('从面板获取 API Key 失败：', error))

    return () => {
      cancelled = true
    }
  }, [profileCount])
}
