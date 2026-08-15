import type { RuntimeMessage } from '../lib/messages'
import { addEvent, countBlocked, read } from '../lib/storage'
import { badgeText, toEvent, whForDay } from './accounting'
import { noteIfBlocked, syncBlocker } from './blocker'

/**
 * MV3 service workers are killed after about 30 seconds idle, so this file
 * holds no state of its own. Every handler reads storage, writes storage and
 * exits. The badge is recomputed from storage rather than incremented.
 */
const BADGE_COLOUR = '#166534'

chrome.runtime.onInstalled.addListener(() => {
	void refreshBadge()
	void syncBlocker()
})

chrome.runtime.onStartup.addListener(() => {
	void refreshBadge()
	void syncBlocker()
})

chrome.runtime.onMessage.addListener(
	(message: RuntimeMessage, _sender, respond) => {
		void handle(message).then(respond)
		// Keeps the message channel open across the await.
		return true
	},
)

async function handle(message: RuntimeMessage) {
	switch (message.type) {
		case 'inference': {
			const event = toEvent(message)
			const store = await addEvent(event)
			await setBadge(whForDay(store))
			return { ok: true, event }
		}
		case 'blocked': {
			await countBlocked()
			return { ok: true }
		}
	}
}

/**
 * The badge is the whole demo: it has to move while someone is watching. It
 * also has to survive the worker being killed between queries, which is why
 * it is derived from storage on every wake-up.
 */
export async function refreshBadge() {
	const store = await read()
	await setBadge(whForDay(store))
}

async function setBadge(wh: number) {
	await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOUR })
	await chrome.action.setBadgeText({ text: badgeText(wh) })
}

// A settings change from the popup moves every number, the badge included,
// and flipping the blocker has to take effect without a reload.
chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== 'local' || !('settings' in changes)) return
	void refreshBadge()
	void syncBlocker()
})

// Counts the redirects the ruleset performed. A navigation that lands on
// google.com/search already carrying udm=14 is one AI Overview that was never
// generated. A user who clicks Google's own Web tab is counted too, which
// overstates slightly rather than inventing anything.
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
	if (changeInfo.url) void noteIfBlocked(changeInfo.url)
})
