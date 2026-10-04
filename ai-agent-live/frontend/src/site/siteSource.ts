import { parseRows } from '../myagents/logParser'
import type { LogResponse } from '../myagents/types'
import type { SiteConfig } from './crypto'

/** Публичный сайт: браузер читает Google Sheets-лог напрямую (Apps Script отдаёт
 *  CORS-заголовки), ключом только для чтения — без Python-backend. */

export const IS_STATIC_SITE = import.meta.env.VITE_STATIC === '1'

let config: SiteConfig | null = null

export function setSiteConfig(next: SiteConfig | null) {
  config = next
}

async function fetchRows(): Promise<unknown[][] | null> {
  try {
    const res = await fetch(`${config!.url}?token=${encodeURIComponent(config!.token)}`)
    const data = (await res.json()) as { rows?: unknown[][] }
    return Array.isArray(data.rows) ? data.rows : null
  } catch {
    return null // Google изредка отдаёт служебную HTML-страницу вместо JSON
  }
}

export async function fetchSiteLog(): Promise<LogResponse> {
  if (!config) return { error: 'not_configured' }
  let rows = await fetchRows()
  if (!rows) {
    await new Promise((r) => setTimeout(r, 3000))
    rows = await fetchRows()
  }
  if (!rows) return { error: 'unavailable' }
  return { runs: parseRows(rows), fetched_at: new Date().toISOString(), stale_data: false }
}
