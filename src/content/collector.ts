import {
	isRequestHint,
	type InferenceMessage,
	type RequestHint,
} from '../lib/messages'
import { platformFor, type PlatformConfig } from '../platforms/registry'

/**
 * ISOLATED-world DOM collector. This is the path that must work: it watches
 * the assistant's response grow, counts characters and measures how long the
 * stream ran. It reads the page and never writes to it, so it cannot break
 * the host.
 */
const cfg = platformFor()

/** How long the DOM must be quiet before a response counts as finished. */
const QUIET_MS = 1200
/** Below this many new characters an event is noise, not a reply. */
const MIN_CHARS = 20
/** A generic-fallback candidate has to hold at least this much text. */
const FALLBACK_CHARS = 200
/** How far to climb from a mutated node when hunting for that candidate. */
const FALLBACK_DEPTH = 8

interface Session {
	el: Element
	t0: number
	last: number
	timer?: ReturnType<typeof setTimeout>
	/** Characters of this element already reported, so bursts do not double count. */
	counted: number
}

/** Returns a teardown function, which matters mainly to the tests. */
export function start(platform: PlatformConfig) {
	let active: Session | null = null
	let hint: RequestHint | null = null
	const reported = new WeakMap<Element, number>()

	const onMessage = (e: MessageEvent) => {
		if (e.source !== window || !isRequestHint(e.data)) return
		if (e.data.platform !== platform.id) return
		hint = e.data
	}
	window.addEventListener('message', onMessage)

	const observer = new MutationObserver(records => {
		const el = findResponse(platform, records)
		if (!el) return

		const now = performance.now()
		if (!active || active.el !== el) {
			active = { el, t0: now, last: now, counted: reported.get(el) ?? 0 }
		}
		active.last = now

		clearTimeout(active.timer)
		const session = active
		session.timer = setTimeout(() => finalize(session), QUIET_MS)
	})

	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
	})

	function finalize(session: Session) {
		if (active === session) active = null

		const text = session.el.textContent ?? ''
		const delta = text.length - session.counted
		if (delta < MIN_CHARS) return
		reported.set(session.el, text.length)

		const message: InferenceMessage = {
			type: 'inference',
			platform: platform.id,
			ts: Date.now(),
			outputChars: delta,
			streamMs: Math.round(session.last - session.t0),
			reasoning: isReasoning(platform, hint?.modelHint),
			modelHint: hint?.modelHint,
			inputTokens: hint?.inputTokens,
		}
		hint = null

		chrome.runtime.sendMessage(message).catch(() => {
			// The service worker may be asleep mid-teardown. Losing one event is
			// better than throwing inside the page.
		})
	}

	return () => {
		observer.disconnect()
		window.removeEventListener('message', onMessage)
		clearTimeout(active?.timer)
	}
}

function findResponse(
	platform: PlatformConfig,
	records: MutationRecord[],
): Element | undefined {
	for (const selector of platform.assistantSelectors) {
		const el = Array.from(document.querySelectorAll(selector)).at(-1)
		if (el && (el.textContent?.length ?? 0) > 0) return el
	}
	return genericCandidate(records)
}

/**
 * Insurance policy. Selectors drift without warning, so when none of them
 * match, fall back to whatever subtree is visibly accumulating text. A broken
 * selector then degrades to slightly less accurate rather than nothing at all.
 */
function genericCandidate(records: MutationRecord[]): Element | undefined {
	for (const record of records) {
		let node: Node | null = record.target
		for (let depth = 0; node && depth < FALLBACK_DEPTH; depth++) {
			const el: Element | null =
				node instanceof Element ? node : node.parentElement
			if (!el) break
			if (el === document.body) break
			if ((el.textContent?.length ?? 0) >= FALLBACK_CHARS) return el
			node = el.parentElement
		}
	}
	return undefined
}

function isReasoning(platform: PlatformConfig, modelHint?: string): boolean {
	if (modelHint && platform.classify(modelHint) === 'reasoning') return true
	return (platform.reasoningSelectors ?? []).some(s =>
		document.querySelector(s),
	)
}

if (cfg) start(cfg)

// A visible breadcrumb for the demo, and the first thing to check if a
// selector has drifted overnight.
console.debug(
	cfg
		? `[lmprint] collecting on ${cfg.label}`
		: '[lmprint] no platform config for this host',
)
