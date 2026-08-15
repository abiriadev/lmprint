/**
 * The MAIN-world interceptor and the ISOLATED-world collector can only talk
 * through window.postMessage, so both ends agree on this envelope.
 *
 * Note what does not cross: prompt text never leaves the page. The interceptor
 * counts tokens in place and posts the number, so nothing readable is stored.
 */
export const BRIDGE = 'lmprint:bridge'

export interface RequestHint {
	source: typeof BRIDGE
	platform: string
	modelHint?: string
	inputTokens: number
	ts: number
}

export function isRequestHint(data: unknown): data is RequestHint {
	return (
		typeof data === 'object' &&
		data !== null &&
		(data as RequestHint).source === BRIDGE
	)
}

/** What the collector reports to the service worker. */
export interface InferenceMessage {
	type: 'inference'
	platform: string
	ts: number
	outputChars: number
	streamMs: number
	reasoning: boolean
	modelHint?: string
	inputTokens?: number
}

export interface BlockedMessage {
	type: 'blocked'
}

export type RuntimeMessage = InferenceMessage | BlockedMessage
