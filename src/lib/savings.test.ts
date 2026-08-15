import { describe, expect, it } from 'vitest'
import { counterfactual, daySavings } from './savings'
import { DEFAULT_SETTINGS } from './storage'
import type { InferenceEvent } from '../model/types'

function event(over: Partial<InferenceEvent> = {}): InferenceEvent {
	return {
		id: 'e',
		ts: Date.now(),
		platform: 'chatgpt',
		outputChars: 800,
		streamMs: 20_000,
		source: 'dom',
		modelClass: 'standard',
		reasoning: false,
		inputTokens: 100,
		outputTokens: 200,
		...over,
	}
}

describe('counterfactual', () => {
	it('has nothing to suggest for a long answer from a standard model', () => {
		expect(
			counterfactual(event({ outputTokens: 900 }), DEFAULT_SETTINGS),
		).toBeNull()
	})

	it('flags a short answer that ran on a large model', () => {
		const s = counterfactual(
			event({ modelClass: 'frontier', outputTokens: 120 }),
			DEFAULT_SETTINGS,
		)
		expect(s?.kind).toBe('smallerModel')
		expect(s!.wh).toBeGreaterThan(0)
	})

	it('flags thinking left on for a short answer', () => {
		const s = counterfactual(
			event({
				modelClass: 'reasoning',
				reasoning: true,
				streamMs: 120_000,
				outputTokens: 80,
			}),
			DEFAULT_SETTINGS,
		)
		expect(s?.kind).toBe('reasoningOff')
		expect(s!.wh).toBeGreaterThan(0)
	})

	it('leaves reasoning alone when it did real work', () => {
		const s = counterfactual(
			event({
				modelClass: 'reasoning',
				reasoning: true,
				streamMs: 120_000,
				outputTokens: 1200,
			}),
			DEFAULT_SETTINGS,
		)
		expect(s).toBeNull()
	})

	it('calls a two-word exchange avoidable outright', () => {
		const s = counterfactual(
			event({ outputTokens: 4, outputChars: 16 }),
			DEFAULT_SETTINGS,
		)
		expect(s?.kind).toBe('avoidable')
	})

	it('never claims a saving larger than the query cost', () => {
		for (const ev of [
			event({ outputTokens: 4 }),
			event({ modelClass: 'frontier', outputTokens: 120 }),
			event({
				modelClass: 'reasoning',
				reasoning: true,
				outputTokens: 80,
			}),
		]) {
			const s = counterfactual(ev, DEFAULT_SETTINGS)
			if (!s) continue
			expect(s.wh).toBeLessThanOrEqual(
				daySavings([ev], DEFAULT_SETTINGS).actualWh + 1e-9,
			)
		}
	})
})

describe('daySavings', () => {
	it('is empty and safe on a day with no events', () => {
		const d = daySavings([], DEFAULT_SETTINGS)
		expect(d.share).toBe(0)
		expect(d.savedWh).toBe(0)
		expect(d.alternativeWh).toBe(0)
	})

	it('reports a share of the day, not an absolute', () => {
		const d = daySavings(
			[
				event({ id: '1', modelClass: 'frontier', outputTokens: 100 }),
				event({ id: '2', outputTokens: 900 }),
			],
			DEFAULT_SETTINGS,
		)
		expect(d.share).toBeGreaterThan(0)
		expect(d.share).toBeLessThan(1)
		expect(d.alternativeWh).toBeCloseTo(d.actualWh - d.savedWh, 10)
	})

	it('counts each kind of suggestion separately', () => {
		const d = daySavings(
			[
				event({ id: '1', outputTokens: 4 }),
				event({ id: '2', modelClass: 'frontier', outputTokens: 100 }),
			],
			DEFAULT_SETTINGS,
		)
		expect(d.byKind.avoidable.count).toBe(1)
		expect(d.byKind.smallerModel.count).toBe(1)
		expect(d.byKind.reasoningOff.count).toBe(0)
	})
})
