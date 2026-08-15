import type { InferenceEvent, ModelClass } from '../model/types'
import { tokensFromChars } from './tokens'
import { dayKey, write, read, RETAIN_DAYS, type Store } from './storage'

/**
 * Venue wifi dies, accounts hit rate limits, and a demo with an empty popup
 * is a failed demo. This replays a plausible fortnight so every surface has
 * something to show without touching the network.
 */
interface Shape {
	platform: string
	modelHint?: string
	modelClass: ModelClass
	reasoning?: boolean
	chars: number
	streamMs: number
}

const SHAPES: Shape[] = [
	{
		platform: 'chatgpt',
		modelHint: 'gpt-4o',
		modelClass: 'standard',
		chars: 2400,
		streamMs: 22_000,
	},
	{
		platform: 'chatgpt',
		modelHint: 'gpt-4o',
		modelClass: 'standard',
		chars: 320,
		streamMs: 4_000,
	},
	{
		platform: 'chatgpt',
		modelHint: 'gpt-4o-mini',
		modelClass: 'mini',
		chars: 900,
		streamMs: 6_000,
	},
	{
		platform: 'chatgpt',
		modelHint: 'o3',
		modelClass: 'reasoning',
		reasoning: true,
		chars: 1800,
		streamMs: 96_000,
	},
	{
		platform: 'chatgpt',
		modelHint: 'gpt-4o',
		modelClass: 'standard',
		chars: 60,
		streamMs: 1_200,
	},
	{
		platform: 'claude',
		modelHint: 'claude-sonnet-4-6',
		modelClass: 'standard',
		chars: 3600,
		streamMs: 28_000,
	},
	{
		platform: 'claude',
		modelHint: 'claude-opus-4-1',
		modelClass: 'frontier',
		chars: 700,
		streamMs: 12_000,
	},
	{
		platform: 'claude',
		modelHint: 'claude-sonnet-4-6',
		modelClass: 'reasoning',
		reasoning: true,
		chars: 1400,
		streamMs: 140_000,
	},
	{
		platform: 'chatgpt',
		modelHint: 'o3',
		modelClass: 'reasoning',
		reasoning: true,
		chars: 380,
		streamMs: 54_000,
	},
	{
		platform: 'gemini',
		modelClass: 'standard',
		chars: 1500,
		streamMs: 11_000,
	},
	{
		platform: 'gemini',
		modelClass: 'standard',
		chars: 240,
		streamMs: 3_000,
	},
	{
		platform: 'perplexity',
		modelClass: 'standard',
		chars: 1100,
		streamMs: 9_000,
	},
]

/** Deterministic, so the demo looks the same every time it is rehearsed. */
function lcg(seed: number) {
	let state = seed
	return () => {
		state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32
		return state / 2 ** 32
	}
}

export function seedEvents(
	days = RETAIN_DAYS,
	now = Date.now(),
): InferenceEvent[] {
	const random = lcg(20260815)
	const events: InferenceEvent[] = []

	for (let d = 0; d < days; d++) {
		// Today is the busiest day, because today is the one on screen.
		const count = d === 0 ? 14 : 3 + Math.floor(random() * 7)
		for (let i = 0; i < count; i++) {
			const shape = SHAPES[Math.floor(random() * SHAPES.length)]!
			// Spread the day between 09:00 and 18:00 local time.
			const dayStart = new Date(now - d * 86_400_000)
			dayStart.setHours(9, 0, 0, 0)
			const ts = dayStart.getTime() + Math.floor(random() * 9 * 3_600_000)
			if (ts > now) continue

			events.push({
				id: `seed-${d}-${i}`,
				ts,
				platform: shape.platform,
				outputChars: shape.chars,
				streamMs: shape.streamMs,
				source: 'seed',
				modelHint: shape.modelHint,
				modelClass: shape.modelClass,
				reasoning: shape.reasoning ?? false,
				inputTokens: 40 + Math.floor(random() * 300),
				outputTokens: tokensFromChars(shape.chars),
			})
		}
	}

	return events.sort((a, b) => a.ts - b.ts)
}

export function seedStore(
	days = RETAIN_DAYS,
	now = Date.now(),
): Pick<Store, 'events' | 'blocked'> {
	const events: Store['events'] = {}
	for (const ev of seedEvents(days, now)) {
		const key = dayKey(ev.ts)
		;(events[key] ??= []).push(ev)
	}

	const blocked: Store['blocked'] = {}
	for (let d = 0; d < days; d++) {
		blocked[dayKey(now - d * 86_400_000)] = d === 0 ? 9 : 2 + (d % 5)
	}

	return { events, blocked }
}

/** Writes the seed over whatever is there, keeping the user's settings. */
export async function loadDemoData(): Promise<void> {
	const store = await read()
	await write({ ...seedStore(), settings: store.settings })
}
