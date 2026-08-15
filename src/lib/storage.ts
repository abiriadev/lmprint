import { DEFAULT_ASSUMPTION_SET, DEFAULT_REGION } from '../model/constants'
import type { InferenceEvent, Settings } from '../model/types'

/** Local date, not UTC, because "today" means the user's today. */
export type DayKey = string

export interface Store {
	events: Record<DayKey, InferenceEvent[]>
	settings: Settings
	blocked: Record<DayKey, number>
}

export const DEFAULT_SETTINGS: Settings = {
	assumptionSet: DEFAULT_ASSUMPTION_SET,
	region: DEFAULT_REGION,
	blockerOn: false,
}

const EMPTY: Store = { events: {}, settings: DEFAULT_SETTINGS, blocked: {} }

/** Days of history to keep. Pruned on every write. */
export const RETAIN_DAYS = 14

export function dayKey(ts: number | Date = Date.now()): DayKey {
	const d = new Date(ts)
	const month = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${d.getFullYear()}-${month}-${day}`
}

/** The last n day keys, most recent first, including days with no events. */
export function recentDays(n = RETAIN_DAYS, from = Date.now()): DayKey[] {
	return Array.from({ length: n }, (_, i) =>
		dayKey(from - i * 24 * 60 * 60 * 1000),
	)
}

/**
 * The service worker is ephemeral, so nothing is ever cached in module scope.
 * Every read goes to chrome.storage.local and every write is a full
 * read-modify-write.
 */
export async function read(): Promise<Store> {
	const raw = (await chrome.storage.local.get(
		EMPTY as unknown as Record<string, unknown>,
	)) as Partial<Store>
	return {
		events: raw.events ?? {},
		settings: { ...DEFAULT_SETTINGS, ...raw.settings },
		blocked: raw.blocked ?? {},
	}
}

export async function write(patch: Partial<Store>): Promise<void> {
	await chrome.storage.local.set(patch)
}

export async function update(f: (store: Store) => Partial<Store>) {
	const store = await read()
	await write(f(store))
	return read()
}

export async function addEvent(event: InferenceEvent): Promise<Store> {
	return update(store => {
		const key = dayKey(event.ts)
		return {
			events: prune({
				...store.events,
				[key]: [...(store.events[key] ?? []), event],
			}),
		}
	})
}

export async function countBlocked(n = 1): Promise<Store> {
	return update(store => {
		const key = dayKey()
		return {
			blocked: prune({
				...store.blocked,
				[key]: (store.blocked[key] ?? 0) + n,
			}),
		}
	})
}

export async function setSettings(patch: Partial<Settings>): Promise<Store> {
	return update(store => ({ settings: { ...store.settings, ...patch } }))
}

export async function clearAll(): Promise<void> {
	await write({ events: {}, blocked: {} })
}

/** Drops anything older than the retention window. */
export function prune<T>(byDay: Record<DayKey, T>): Record<DayKey, T> {
	const keep = new Set(recentDays())
	return Object.fromEntries(
		Object.entries(byDay).filter(([key]) => keep.has(key)),
	)
}

export function eventsOn(store: Store, key: DayKey): InferenceEvent[] {
	return store.events[key] ?? []
}

export function allEvents(store: Store): InferenceEvent[] {
	return Object.values(store.events).flat()
}
