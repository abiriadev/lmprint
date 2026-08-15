import { estimate } from '../model/estimator'
import type { InferenceEvent, Settings } from '../model/types'

export type SavingKind = 'avoidable' | 'reasoningOff' | 'smallerModel'

export interface Saving {
	eventId: string
	kind: SavingKind
	/** Watt-hours at the meter that the alternative would not have spent. */
	wh: number
	label: string
}

/** A reply this short is unlikely to have needed a model at all. */
const TRIVIAL_TOKENS = 25
/** Above this, a reasoning model was probably doing real work. */
const REASONING_WORTH_IT_TOKENS = 400
/** Above this, a small model starts to be a real quality trade. */
const SMALL_MODEL_CEILING_TOKENS = 300
/** What a non-reasoning reply of the same length would have streamed for. */
const NORMAL_STREAM_MS = 20_000

/**
 * The counterfactual for one event, or null when there was nothing cheaper
 * worth suggesting. Note that prompts are never stored, so triviality is
 * judged by how little came back, not by reading what was asked.
 */
export function counterfactual(
	ev: InferenceEvent,
	settings: Settings,
): Saving | null {
	const actual = estimate(ev, settings).whSite.central

	if (ev.modelClass !== 'image' && ev.outputTokens < TRIVIAL_TOKENS) {
		return {
			eventId: ev.id,
			kind: 'avoidable',
			wh: actual,
			label: 'a reply this short probably did not need a model',
		}
	}

	if (ev.reasoning && ev.outputTokens < REASONING_WORTH_IT_TOKENS) {
		const without = estimate(
			{
				...ev,
				reasoning: false,
				modelClass: 'standard',
				streamMs: Math.min(ev.streamMs, NORMAL_STREAM_MS),
			},
			settings,
		).whSite.central
		return {
			eventId: ev.id,
			kind: 'reasoningOff',
			wh: Math.max(actual - without, 0),
			label: 'thinking was on for a short answer',
		}
	}

	if (
		(ev.modelClass === 'standard' || ev.modelClass === 'frontier') &&
		ev.outputTokens < SMALL_MODEL_CEILING_TOKENS
	) {
		const smaller = estimate({ ...ev, modelClass: 'mini' }, settings).whSite
			.central
		return {
			eventId: ev.id,
			kind: 'smallerModel',
			wh: Math.max(actual - smaller, 0),
			label: 'a short answer from a large model',
		}
	}

	return null
}

export interface DaySavings {
	/** What the day actually cost, watt-hours at the meter. */
	actualWh: number
	/** What it would have cost with every suggestion taken. */
	alternativeWh: number
	savedWh: number
	/** Fraction of the day's energy that was avoidable, 0 to 1. */
	share: number
	savings: Saving[]
	byKind: Record<SavingKind, { count: number; wh: number }>
}

export function daySavings(
	events: readonly InferenceEvent[],
	settings: Settings,
): DaySavings {
	const actualWh = events.reduce(
		(sum, ev) => sum + estimate(ev, settings).whSite.central,
		0,
	)
	const savings = events
		.map(ev => counterfactual(ev, settings))
		.filter((s): s is Saving => s !== null && s.wh > 0)

	const savedWh = savings.reduce((sum, s) => sum + s.wh, 0)
	const byKind: DaySavings['byKind'] = {
		avoidable: { count: 0, wh: 0 },
		reasoningOff: { count: 0, wh: 0 },
		smallerModel: { count: 0, wh: 0 },
	}
	for (const s of savings) {
		byKind[s.kind].count++
		byKind[s.kind].wh += s.wh
	}

	return {
		actualWh,
		alternativeWh: actualWh - savedWh,
		savedWh,
		share: actualWh > 0 ? savedWh / actualWh : 0,
		savings,
		byKind,
	}
}
