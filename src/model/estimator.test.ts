import { describe, expect, it } from 'vitest'
import { estimate, estimateAll } from './estimator'
import type { InferenceEvent, ModelClass, Settings } from './types'

const SETTINGS: Settings = {
	assumptionSet: 'google2025',
	region: 'us',
	blockerOn: false,
}

function event(over: Partial<InferenceEvent> = {}): InferenceEvent {
	return {
		id: 'e1',
		ts: 0,
		platform: 'chatgpt',
		outputChars: 2000,
		streamMs: 20_000,
		source: 'dom',
		modelClass: 'standard',
		reasoning: false,
		inputTokens: 100,
		outputTokens: 500,
		...over,
	}
}

describe('anchors', () => {
	it('puts a standard 500-token reply at about 0.3 Wh at the meter', () => {
		const { whSite } = estimate(event(), SETTINGS)
		// Epoch AI ~0.3 Wh, OpenAI 0.34 Wh. Ten percent is our stated tolerance.
		expect(whSite.central).toBeGreaterThan(0.27)
		expect(whSite.central).toBeLessThan(0.36)
	})

	it('puts that same reply near 0.7 mL of water', () => {
		const { litres } = estimate(event(), SETTINGS)
		// OpenAI says 0.32 mL. Ours is higher because theirs is onsite only.
		expect(litres.central * 1000).toBeGreaterThan(0.5)
		expect(litres.central * 1000).toBeLessThan(1.0)
	})

	it('prices carbon off the US grid, not the user grid', () => {
		const us = estimate(event(), SETTINGS)
		const on = estimate(event(), { ...SETTINGS, region: 'ontario' })
		expect(us.gCO2e.central / on.gCO2e.central).toBeCloseTo(369 / 30, 5)
	})
})

describe('assumption sets', () => {
	it('moves the headline number by roughly ten times', () => {
		const google = estimate(event(), SETTINGS).whSite.central
		const devries = estimate(event(), {
			...SETTINGS,
			assumptionSet: 'devries2023',
		}).whSite.central
		const ratio = devries / google
		expect(ratio).toBeGreaterThan(8)
		expect(ratio).toBeLessThan(20)
	})
})

describe('model classes', () => {
	const central = (cls: ModelClass, over: Partial<InferenceEvent> = {}) =>
		estimate(event({ modelClass: cls, ...over }), SETTINGS).whSite.central

	it('orders mini below standard below frontier', () => {
		expect(central('mini')).toBeLessThan(central('standard'))
		expect(central('standard')).toBeLessThan(central('frontier'))
	})

	it('charges a mini model roughly a fifth of a standard one', () => {
		// The blend floors the saving: the clock term does not shrink as fast
		// as the token term, which is the honest answer.
		const ratio = central('mini') / central('standard')
		expect(ratio).toBeGreaterThan(0.1)
		expect(ratio).toBeLessThan(0.4)
	})

	it('gives an image generation a flat cost independent of stream length', () => {
		expect(central('image', { streamMs: 4000 })).toBeCloseTo(
			central('image', { streamMs: 90_000 }),
			10,
		)
	})
})

describe('reasoning', () => {
	const thinking = event({
		modelClass: 'reasoning',
		reasoning: true,
		streamMs: 120_000,
	})

	it('costs several times a standard reply of the same visible length', () => {
		const ratio =
			estimate(thinking, SETTINGS).whSite.central /
			estimate(event(), SETTINGS).whSite.central
		expect(ratio).toBeGreaterThan(4)
	})

	it('keeps growing with thinking time even when no tokens are visible', () => {
		const short = estimate(
			{ ...thinking, streamMs: 20_000, outputTokens: 40 },
			SETTINGS,
		).whSite.central
		const long = estimate(
			{ ...thinking, streamMs: 180_000, outputTokens: 40 },
			SETTINGS,
		).whSite.central
		expect(long).toBeGreaterThan(short * 3)
	})

	it('carries a much wider band than a normal reply', () => {
		const r = estimate(thinking, SETTINGS).whSite
		const n = estimate(event(), SETTINGS).whSite
		expect(r.high / r.low).toBeGreaterThan(n.high / n.low)
		// The published spread really is this wide, and hiding it would be the lie.
		expect(r.high / r.low).toBeGreaterThan(20)
	})
})

describe('ranges', () => {
	it('always brackets the central estimate', () => {
		for (const cls of [
			'mini',
			'standard',
			'frontier',
			'reasoning',
			'image',
		] as const) {
			const e = estimate(event({ modelClass: cls }), SETTINGS)
			for (const r of [e.whIT, e.whSite, e.gCO2e, e.litres]) {
				expect(r.low).toBeLessThanOrEqual(r.central)
				expect(r.central).toBeLessThanOrEqual(r.high)
			}
		}
	})
})

describe('estimateAll', () => {
	it('sums to zero for an empty day', () => {
		expect(estimateAll([], SETTINGS).whSite.central).toBe(0)
	})

	it('is additive', () => {
		const one = estimate(event(), SETTINGS).whSite.central
		const three = estimateAll([event(), event(), event()], SETTINGS).whSite
			.central
		expect(three).toBeCloseTo(one * 3, 10)
	})
})
