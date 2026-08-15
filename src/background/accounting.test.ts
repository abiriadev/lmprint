import { describe, expect, it } from 'vitest'
import { badgeText, toEvent, whForDay } from './accounting'
import type { InferenceMessage } from '../lib/messages'
import { DEFAULT_SETTINGS, dayKey, type Store } from '../lib/storage'

function message(over: Partial<InferenceMessage> = {}): InferenceMessage {
	return {
		type: 'inference',
		platform: 'chatgpt',
		ts: Date.now(),
		outputChars: 2000,
		streamMs: 20_000,
		reasoning: false,
		...over,
	}
}

describe('toEvent', () => {
	it('classifies from the model name when the interceptor caught one', () => {
		expect(toEvent(message({ modelHint: 'gpt-4o-mini' })).modelClass).toBe(
			'mini',
		)
		expect(
			toEvent(message({ modelHint: 'claude-opus-4' })).modelClass,
		).toBe('frontier')
		expect(toEvent(message({ modelHint: 'o3' })).modelClass).toBe(
			'reasoning',
		)
	})

	it('falls back to standard when nothing is known', () => {
		expect(toEvent(message()).modelClass).toBe('standard')
	})

	it('lets a visible thinking toggle override the model name', () => {
		const ev = toEvent(message({ modelHint: 'gpt-4o', reasoning: true }))
		expect(ev.modelClass).toBe('reasoning')
		expect(ev.reasoning).toBe(true)
	})

	it('marks reasoning when only the model name says so', () => {
		expect(toEvent(message({ modelHint: 'o3' })).reasoning).toBe(true)
	})

	it('derives output tokens from the characters that arrived', () => {
		expect(toEvent(message({ outputChars: 2000 })).outputTokens).toBe(500)
	})

	it('assumes a prompt size when the request was never seen', () => {
		expect(toEvent(message()).inputTokens).toBeGreaterThan(0)
		expect(toEvent(message({ inputTokens: 7 })).inputTokens).toBe(7)
	})

	it('records where the detail came from', () => {
		expect(toEvent(message()).source).toBe('dom')
		expect(toEvent(message({ modelHint: 'gpt-4o' })).source).toBe('network')
	})

	it('gives every event a distinct id', () => {
		const ids = new Set(
			Array.from({ length: 50 }, () => toEvent(message()).id),
		)
		expect(ids.size).toBe(50)
	})
})

describe('whForDay', () => {
	const store = (events: Store['events']): Store => ({
		events,
		settings: DEFAULT_SETTINGS,
		blocked: {},
	})

	it('is zero on a day with nothing on it', () => {
		expect(whForDay(store({}))).toBe(0)
	})

	it('adds up only today', () => {
		const today = [toEvent(message()), toEvent(message())]
		const s = store({
			[dayKey()]: today,
			'2020-01-01': [toEvent(message())],
		})
		expect(whForDay(s)).toBeCloseTo(
			whForDay(store({ [dayKey()]: today })),
			10,
		)
	})
})

describe('badgeText', () => {
	it('keeps one decimal while the number is still small', () => {
		expect(badgeText(0)).toBe('0')
		expect(badgeText(0.32)).toBe('0.3')
		expect(badgeText(4.87)).toBe('4.9')
	})

	it('rounds off once it would not fit', () => {
		expect(badgeText(12.4)).toBe('12')
		expect(badgeText(999.6)).toBe('1000')
	})
})
