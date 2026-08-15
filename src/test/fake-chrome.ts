/**
 * Just enough of chrome.storage.local to run the accounting off-browser.
 * Test-only, but it lives in src so the type checker keeps it honest.
 */
export function installFakeChrome(initial: Record<string, unknown> = {}) {
	const data = new Map(Object.entries(structuredClone(initial)))

	const local = {
		async get(
			defaults?: Record<string, unknown> | string | string[] | null,
		) {
			const keys =
				defaults &&
				typeof defaults === 'object' &&
				!Array.isArray(defaults)
					? Object.keys(defaults)
					: [...data.keys()]
			return Object.fromEntries(
				keys.map(k => [k, structuredClone(data.get(k))]),
			)
		},
		async set(patch: Record<string, unknown>) {
			for (const [k, v] of Object.entries(patch))
				data.set(k, structuredClone(v))
		},
		async clear() {
			data.clear()
		},
	}

	const fake = {
		storage: { local, onChanged: { addListener() {} } },
		action: {
			setBadgeText: async () => {},
			setBadgeBackgroundColor: async () => {},
		},
		runtime: { sendMessage: async () => {} },
	}

	Object.assign(globalThis, { chrome: fake })
	return { data, fake }
}
