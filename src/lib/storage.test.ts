import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeChrome } from '../test/fake-chrome'
import {
	addEvent,
	allEvents,
	countBlocked,
	dayKey,
	prune,
	read,
	recentDays,
	RETAIN_DAYS,
	setSettings,
} from './storage'
import type { InferenceEvent } from '../model/types'

const DAY_MS = 24 * 60 * 60 * 1000

function event(ts: number): InferenceEvent {
	return {
		id: String(ts),
		ts,
		platform: 'chatgpt',
		outputChars: 1000,
		streamMs: 10_000,
		source: 'dom',
		modelClass: 'standard',
		reasoning: false,
		inputTokens: 100,
		outputTokens: 250,
	}
}

beforeEach(() => {
	installFakeChrome()
})

describe('storage', () => {
	it('returns defaults on a first run', async () => {
		const store = await read()
		expect(store.events).toEqual({})
		expect(store.settings.assumptionSet).toBe('google2025')
		expect(store.settings.region).toBe('us')
	})

	it('files events under their own local day', async () => {
		const yesterday = Date.now() - DAY_MS
		await addEvent(event(Date.now()))
		const store = await addEvent(event(yesterday))

		expect(Object.keys(store.events).sort()).toEqual(
			[dayKey(), dayKey(yesterday)].sort(),
		)
	})

	it('accumulates several events in one day', async () => {
		await addEvent(event(Date.now()))
		await addEvent(event(Date.now()))
		const store = await addEvent(event(Date.now()))
		expect(allEvents(store)).toHaveLength(3)
	})

	it('drops history past the retention window on write', async () => {
		const old = Date.now() - (RETAIN_DAYS + 3) * DAY_MS
		await addEvent(event(old))
		const store = await addEvent(event(Date.now()))

		expect(store.events[dayKey(old)]).toBeUndefined()
		expect(allEvents(store)).toHaveLength(1)
	})

	it('counts blocked overviews per day', async () => {
		await countBlocked()
		const store = await countBlocked()
		expect(store.blocked[dayKey()]).toBe(2)
	})

	it('merges settings rather than replacing them', async () => {
		const store = await setSettings({ region: 'ontario' })
		expect(store.settings.region).toBe('ontario')
		expect(store.settings.assumptionSet).toBe('google2025')
	})

	it('survives a settings shape written by an older version', async () => {
		installFakeChrome({ settings: { region: 'world' } })
		const store = await read()
		expect(store.settings.region).toBe('world')
		expect(store.settings.blockerOn).toBe(false)
	})
})

describe('recentDays', () => {
	it('runs backwards from today without gaps', () => {
		const days = recentDays(3)
		expect(days).toHaveLength(3)
		expect(days[0]).toBe(dayKey())
		expect(days[2]).toBe(dayKey(Date.now() - 2 * DAY_MS))
	})
})

describe('prune', () => {
	it('keeps recent keys and drops the rest', () => {
		const kept = dayKey()
		const dropped = dayKey(Date.now() - 60 * DAY_MS)
		expect(prune({ [kept]: 1, [dropped]: 1 })).toEqual({ [kept]: 1 })
	})
})
