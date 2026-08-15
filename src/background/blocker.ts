import { countBlocked, read } from '../lib/storage'

/**
 * Tier 2 prevention, not tier 1 cosmetics. Hiding an AI Overview with CSS
 * saves nothing, because the summary was already generated server side.
 * Redirecting to Google's own Web filter before the request leaves the
 * browser means the summary is never generated at all.
 *
 * Rule 1 in rules.json is the loop-breaker: declarativeNetRequest gives
 * "allow" precedence over "redirect" at a higher priority, so once udm=14 is
 * on the URL the redirect stops firing. Without it you get a redirect loop
 * and an error page.
 */
export const RULESET_ID = 'ruleset'

export async function setBlocker(on: boolean) {
	await chrome.declarativeNetRequest.updateEnabledRulesets(
		on
			? { enableRulesetIds: [RULESET_ID] }
			: { disableRulesetIds: [RULESET_ID] },
	)
}

/** Brings the ruleset back in line with storage after a worker restart. */
export async function syncBlocker() {
	const store = await read()
	await setBlocker(store.settings.blockerOn)
}

/**
 * A redirect is not observable from declarativeNetRequest without the
 * feedback permission, so the count comes from watching for the tell: a
 * google.com/search navigation that arrives already carrying udm=14 which
 * the user did not type.
 */
export function isBlockedSearch(url: string): boolean {
	try {
		const parsed = new URL(url)
		if (!/(^|\.)google\.com$/.test(parsed.hostname)) return false
		if (parsed.pathname !== '/search') return false
		return parsed.searchParams.get('udm') === '14'
	} catch {
		return false
	}
}

export async function noteIfBlocked(url: string) {
	if (!isBlockedSearch(url)) return false
	const store = await read()
	if (!store.settings.blockerOn) return false
	await countBlocked()
	return true
}
