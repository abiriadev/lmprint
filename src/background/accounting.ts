import type { InferenceMessage } from '../lib/messages'
import { tokensFromChars } from '../lib/tokens'
import { PLATFORMS } from '../platforms/registry'
import { estimateAll } from '../model/estimator'
import type { InferenceEvent, ModelClass, Settings } from '../model/types'
import { dayKey, eventsOn, type Store } from '../lib/storage'
import { OVERVIEW_WH } from '../model/constants'

/**
 * When the interceptor did not catch the request we have no prompt at all.
 * Prefill is about a twentieth of the cost of decode, so a flat assumption
 * here moves the total by well under a percent.
 */
const ASSUMED_PROMPT_TOKENS = 100

let counter = 0

/** Turns what the page could see into the event the model can price. */
export function toEvent(msg: InferenceMessage): InferenceEvent {
	const platform = PLATFORMS.find(p => p.id === msg.platform)
	const classified = platform?.classify(msg.modelHint) ?? 'standard'
	// A thinking toggle beats the model name: gpt-4o with reasoning on is a
	// reasoning query whatever the endpoint called it.
	const modelClass: ModelClass = msg.reasoning ? 'reasoning' : classified

	return {
		id: `${msg.ts}-${counter++}`,
		ts: msg.ts,
		platform: msg.platform,
		outputChars: msg.outputChars,
		streamMs: msg.streamMs,
		source: msg.modelHint ? 'network' : 'dom',
		modelHint: msg.modelHint,
		modelClass,
		reasoning: msg.reasoning || classified === 'reasoning',
		inputTokens: msg.inputTokens ?? ASSUMED_PROMPT_TOKENS,
		outputTokens: tokensFromChars(msg.outputChars),
	}
}

/** Watt-hours at the meter for a given day, which is what the badge shows. */
export function whForDay(store: Store, key = dayKey()): number {
	return estimateAll(eventsOn(store, key), store.settings).whSite.central
}

/** Energy the blocker prevented on a given day. */
export function avoidedWh(store: Store, key = dayKey()): number {
	return (store.blocked[key] ?? 0) * OVERVIEW_WH
}

export function badgeText(wh: number): string {
	if (wh <= 0) return '0'
	if (wh < 10) return wh.toFixed(1)
	return String(Math.round(wh))
}

export type { Settings }
