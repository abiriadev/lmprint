import type { ModelClass } from '../model/types'

export interface PlatformConfig {
	id: string
	label: string
	hostPattern: RegExp
	/** Ordered fallbacks, first selector that matches a non-empty node wins. */
	assistantSelectors: string[]
	/** Selectors whose presence means the model is showing its thinking. */
	reasoningSelectors?: string[]
	/** Endpoints treated as inference calls by the MAIN-world interceptor. */
	endpoints?: RegExp[]
	extractPrompt?: (body: unknown) => string
	extractModel?: (body: unknown) => string | undefined
	classify: (modelHint?: string) => ModelClass
}

const byName = (h = ''): ModelClass => {
	const s = h.toLowerCase()
	if (/mini|haiku|flash|lite|nano/.test(s)) return 'mini'
	if (/o[1-9]|think|reason/.test(s)) return 'reasoning'
	if (/opus|ultra|pro-max/.test(s)) return 'frontier'
	return 'standard'
}

/** Body shapes vary per platform, so reach in defensively rather than cast. */
function pick(body: unknown, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>(
			(acc, key) =>
				acc && typeof acc === 'object'
					? (acc as Record<string, unknown>)[key]
					: undefined,
			body,
		)
}

function asString(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined
}

export const PLATFORMS: PlatformConfig[] = [
	{
		id: 'chatgpt',
		label: 'ChatGPT',
		hostPattern: /chatgpt\.com|chat\.openai\.com/,
		assistantSelectors: [
			'[data-message-author-role="assistant"]',
			'div.markdown.prose',
		],
		reasoningSelectors: ['[data-testid*="thinking"]', '[class*="thought"]'],
		endpoints: [/\/backend-api\/f?\/?conversation/],
		extractPrompt: b => {
			const messages = pick(b, 'messages')
			if (!Array.isArray(messages)) return ''
			const parts = pick(messages.at(-1), 'content.parts')
			return Array.isArray(parts)
				? parts.filter(p => typeof p === 'string').join(' ')
				: ''
		},
		extractModel: b => asString(pick(b, 'model')),
		classify: byName,
	},
	{
		id: 'claude',
		label: 'Claude',
		hostPattern: /claude\.ai/,
		assistantSelectors: [
			'.font-claude-response',
			'[data-testid="conversation-turn"]',
		],
		reasoningSelectors: ['[data-testid*="thinking"]'],
		endpoints: [/\/chat_conversations\/[^/]+\/completion/],
		extractPrompt: b => asString(pick(b, 'prompt')) ?? '',
		extractModel: b => asString(pick(b, 'model')),
		classify: byName,
	},
	{
		id: 'gemini',
		label: 'Gemini',
		hostPattern: /gemini\.google\.com/,
		// Gemini's transport is batchexecute, which is not worth parsing. DOM only.
		assistantSelectors: ['model-response', 'message-content'],
		classify: () => 'standard',
	},
	{
		id: 'perplexity',
		label: 'Perplexity',
		hostPattern: /perplexity\.ai/,
		assistantSelectors: ['[class*="prose"]'],
		classify: () => 'standard',
	},
	{
		id: 'copilot',
		label: 'GitHub Copilot',
		hostPattern: /github\.com\/copilot/,
		assistantSelectors: ['[data-testid="chat-message"]'],
		classify: () => 'standard',
	},
]

export function platformFor(url = location.href): PlatformConfig | undefined {
	const { host, pathname } = new URL(url)
	return PLATFORMS.find(p => p.hostPattern.test(host + pathname))
}

export function platformLabel(id: string): string {
	return PLATFORMS.find(p => p.id === id)?.label ?? id
}
