import { estimate, estimateAll, estimateAvoided } from '../model/estimator'
import { OVERVIEW_WH } from '../model/constants'
import type { Estimate, InferenceEvent, Settings } from '../model/types'
import { daySavings, type DaySavings } from './savings'
import {
	dayKey,
	eventsOn,
	recentDays,
	type DayKey,
	type Store,
} from './storage'

export interface PlatformSlice {
	platform: string
	events: number
	wh: number
}

export interface DaySummary {
	key: DayKey
	events: InferenceEvent[]
	total: Estimate
	/** What the blocker prevented, priced the same way as a real query. */
	avoided: Estimate
	blockedCount: number
	platforms: PlatformSlice[]
	savings: DaySavings
	reasoningShare: number
	avgOutputTokens: number
	frontierShare: number
}

export function summarise(
	store: Store,
	key: DayKey = dayKey(),
	settings: Settings = store.settings,
): DaySummary {
	const events = eventsOn(store, key)
	const blockedCount = store.blocked[key] ?? 0

	const byPlatform = new Map<string, PlatformSlice>()
	for (const ev of events) {
		const slice = byPlatform.get(ev.platform) ?? {
			platform: ev.platform,
			events: 0,
			wh: 0,
		}
		slice.events++
		slice.wh += estimate(ev, settings).whSite.central
		byPlatform.set(ev.platform, slice)
	}

	const share = (f: (ev: InferenceEvent) => boolean) =>
		events.length ? events.filter(f).length / events.length : 0

	return {
		key,
		events,
		total: estimateAll(events, settings),
		avoided: estimateAvoided(blockedCount * OVERVIEW_WH, settings),
		blockedCount,
		platforms: [...byPlatform.values()].sort((a, b) => b.wh - a.wh),
		savings: daySavings(events, settings),
		reasoningShare: share(ev => ev.reasoning),
		frontierShare: share(
			ev => ev.modelClass === 'frontier' || ev.modelClass === 'reasoning',
		),
		avgOutputTokens: events.length
			? events.reduce((sum, ev) => sum + ev.outputTokens, 0) /
				events.length
			: 0,
	}
}

export interface TrendPoint {
	key: DayKey
	wh: number
	events: number
}

/** Oldest first, so it reads left to right on a chart. */
export function trend(store: Store, days = 7): TrendPoint[] {
	return recentDays(days)
		.map(key => {
			const events = eventsOn(store, key)
			return {
				key,
				wh: estimateAll(events, store.settings).whSite.central,
				events: events.length,
			}
		})
		.reverse()
}
