/**
 * WorkBuddy model-aware web search providers.
 *
 * Two real providers are registered; the active one is chosen by
 * `ctx.web.searchProviderId`, which `index.ts` flips on the `agent/request`
 * event (the moment a model is selected/switched for a conversation):
 *   - `workbuddy-tinyfish`  : used when the active model's provider is
 *     `workbuddy`. Search goes through TinyFish (a free, keyed search API),
 *     so it never spends DeepSeek tokens.
 *   - `deepseek-official`   : used for every other provider (e.g. DeepSeek).
 *     It is the exact same `web_search_20250305` call DSH's own provider uses.
 *
 * The `search()` method of each provider does NOT branch on the model — the
 * switch happens at model-selection time, not at search-call time.
 *
 * @module dsh-workbuddy-connect/search-provider
 */

import type { Context } from '@deepseek-ai/cordis'

/** Minimal structural type for the DSH web search request we receive. */
export interface WebSearchRequest {
  query: string
  maxResults?: number
  /** optional engine hint forwarded by some search tools; ignored here. */
  engine?: string
  timeRange?: unknown
}

/** One normalized search result returned to the DSH web seam. */
export interface WebSearchResult {
  url: string
  title?: string
  /** snippet / cited text; DSH renders this as the source content. */
  snippet?: string
  publishedAt?: string
}

export interface WebSearchOutcome {
  sources: WebSearchResult[]
  truncated?: boolean
}

export interface WorkBuddySearchProviderOptions {
  /** TinyFish API key; required by the `workbuddy-tinyfish` provider. */
  tinyfishApiKey?: string
  /** DeepSeek API key for the official `deepseek-official` provider. */
  deepseekApiKey?: string
}

const TINYFISH_URL = 'https://api.search.tinyfish.ai'
const DEEPSEEK_ANTHROPIC_URL = 'https://api.deepseek.com/anthropic/v1/messages'

function decodeEntities(text: string): string {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function cleanSnippet(text: string | undefined): string | undefined {
  if (!text) return undefined
  return String(text)
    .replace(/^\s*(#{1,6}\s*|>\s*)/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}

function uniqueSources(sources: WebSearchResult[], limit: number): WebSearchResult[] {
  const seen = new Set<string>()
  const out: WebSearchResult[] = []
  for (const s of sources) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url)
      out.push(s)
    }
    if (out.length >= limit) break
  }
  return out
}

/** TinyFish free search: GET with X-API-Key. Structured JSON results. */
async function searchTinyFish(
  query: string,
  maxResults: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<WebSearchOutcome> {
  const url = `${TINYFISH_URL}?${new URLSearchParams({ query, location: 'US', language: 'zh' })}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  let response: Response
  try {
    response = await fetch(url, {
      headers: { 'X-API-Key': apiKey, accept: 'application/json', 'user-agent': 'deepseek-harness/workbuddy-connect' },
      signal: controller.signal,
    })
  } catch (error: unknown) {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    if (signal?.aborted) throw error
    throw new Error(`TinyFish request failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`TinyFish search error (HTTP ${response.status}): ${detail.slice(0, 200)}`)
  }
  const data = (await response.json().catch(() => null)) as
    | { results?: Array<{ title?: string; url?: string; snippet?: string; site_name?: string }> }
    | null
  const results = (data?.results ?? []).filter((r) => r.url).map((r) => ({
    url: r.url as string,
    ...(r.title ? { title: decodeEntities(r.title) } : {}),
    ...(r.snippet ? { snippet: cleanSnippet(decodeEntities(r.snippet)) } : {}),
  }))
  return { sources: uniqueSources(results, maxResults) }
}

/** DeepSeek official web_search_20250305 via the Anthropic-shaped endpoint. */
async function searchDeepSeekOfficial(
  query: string,
  maxResults: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<WebSearchOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  let response: Response
  try {
    response = await fetch(DEEPSEEK_ANTHROPIC_URL, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'x-api-key': apiKey,
        authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'deepseek-harness/workbuddy-connect',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [{ type: 'text', text: `Perform a web search for the query: ${query}` }] }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      }),
      signal: controller.signal,
    })
  } catch (error: unknown) {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    if (signal?.aborted) throw error
    throw new Error(`DeepSeek search request failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`DeepSeek search error (HTTP ${response.status}): ${detail.slice(0, 200)}`)
  }
  const data = (await response.json().catch(() => null)) as {
    content?: Array<{ type: string; citations?: Array<{ url?: string; cited_text?: string }>; text?: string }>
  } | null
  const blocks = data?.content ?? []
  const snippets = new Map<string, string>()
  for (const block of blocks) {
    if (block.type !== 'text') continue
    for (const cite of block.citations ?? []) {
      if (cite.url && cite.cited_text && !snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text)
    }
  }
  const sources: WebSearchResult[] = []
  for (const block of blocks) {
    if (block.type !== 'web_search_tool_result') continue
    for (const item of (block as unknown as { content?: Array<{ type: string; url?: string; title?: string; page_age?: string }> }).content ?? []) {
      if (item.type !== 'web_search_result' || !item.url) continue
      if (sources.some((s) => s.url === item.url)) continue
      sources.push({
        url: item.url,
        ...(item.title ? { title: item.title } : {}),
        ...(snippets.get(item.url) ? { snippet: cleanSnippet(snippets.get(item.url)) } : {}),
        ...(item.page_age ? { publishedAt: item.page_age } : {}),
      })
    }
  }
  return { sources: uniqueSources(sources, maxResults) }
}

function guardQuery(request: WebSearchRequest): { query: string; maxResults: number } {
  const query = request.query
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('query is required')
  }
  const maxResults = Math.min(Math.max(Number(request.maxResults) || 5, 1), 20)
  return { query, maxResults }
}



/** Provider id used for the WorkBuddy (TinyFish) search route. */
export const TINYFISH_PROVIDER_ID = 'workbuddy-tinyfish'
/** Provider id used for the official DeepSeek search route. */
export const DEEPSEEK_PROVIDER_ID = 'deepseek-official'

/**
 * Provider that routes search through TinyFish (free). Selected when the
 * active conversation model's provider is `workbuddy`.
 */
export function createTinyFishProvider(
  ctx: Context,
  resolveKeys: () => WorkBuddySearchProviderOptions,
) {
  return {
    id: TINYFISH_PROVIDER_ID,
    available() {
      return true
    },
    async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchOutcome> {
      const { query, maxResults } = guardQuery(request)
      const { tinyfishApiKey, deepseekApiKey } = await resolveKeys()
      if (!tinyfishApiKey) {
        throw new Error('workbuddy-connect: TINYFISH_API_KEY is not set; cannot use the WorkBuddy search route')
      }
      let lastError: unknown
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const out = await searchTinyFish(query, maxResults, tinyfishApiKey, signal)
          return out
        } catch (error: unknown) {
          lastError = error
          const msg = error instanceof Error ? error.message : String(error)
        }
      }
      // All TinyFish attempts failed: transparently fall back to the system
      // (official) search engine for this request and surface a small note.
      ctx.logger.warn('workbuddy-connect: TinyFish search failed after 3 attempts; falling back to system search')
      if (deepseekApiKey) {
        try {
          const out = await searchDeepSeekOfficial(query, maxResults, deepseekApiKey, signal)
          const note: WebSearchResult = {
            url: 'https://tinyfish.ai/status',
            title: '⚠️ TinyFish 提示',
            snippet: 'tinyfish 引擎出现故障，已自动恢复系统搜索引擎',
          }
          return { sources: [note, ...out.sources] }
        } catch (fallbackError: unknown) {
          const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        }
      }
      throw new Error(
        `TinyFish search failed after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      )
    },
  }
}

/**
 * Provider that routes search through the official DeepSeek `web_search_20250305`
 * call. Selected for every non-WorkBuddy model provider.
 */
export function createDeepSeekOfficialProvider(
  ctx: Context,
  resolveKeys: () => WorkBuddySearchProviderOptions,
) {
  return {
    id: DEEPSEEK_PROVIDER_ID,
    available() {
      return true
    },
    async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchOutcome> {
      const { query, maxResults } = guardQuery(request)
      const { deepseekApiKey } = await resolveKeys()
      if (!deepseekApiKey) {
        throw new Error('workbuddy-connect: DEEPSEEK_API_KEY is not set; cannot use the official search route')
      }
      const out = await searchDeepSeekOfficial(query, maxResults, deepseekApiKey, signal)
      return out
    },
  }
}
