import { BRIDGE, type RequestHint } from '../lib/messages'
import { platformFor } from '../platforms/registry'
import { estimateTokens } from '../lib/tokens'

/**
 * MAIN-world enhancement. It reads the request body of an inference call to
 * learn the model name and prompt size, and returns the original Response
 * completely untouched.
 *
 * It deliberately does not tee() the response stream. Exact SSE token counts
 * are tempting, but reconstructing a Response can break streaming on the very
 * page we are demoing, and the DOM already tells us about the output.
 */
const cfg = platformFor()
const KILL_SWITCH = 'lmprint:no-intercept'

if (cfg?.endpoints && !localStorage.getItem(KILL_SWITCH)) {
	const original = window.fetch

	window.fetch = new Proxy(original, {
		apply(target, thisArg, args: Parameters<typeof fetch>) {
			try {
				inspect(args)
			} catch {
				// Never let our accounting break the host page.
			}
			return Reflect.apply(target, thisArg, args)
		},
	})

	function inspect(args: Parameters<typeof fetch>) {
		const [input, init] = args
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.href
					: input.url
		if (!cfg!.endpoints!.some(re => re.test(url))) return

		// Only plain string bodies. Reading a stream would consume it.
		const body =
			typeof init?.body === 'string' ? safeParse(init.body) : undefined

		const hint: RequestHint = {
			source: BRIDGE,
			platform: cfg!.id,
			modelHint:
				body === undefined ? undefined : cfg!.extractModel?.(body),
			inputTokens:
				body === undefined
					? 0
					: estimateTokens(cfg!.extractPrompt?.(body) ?? ''),
			ts: Date.now(),
		}
		window.postMessage(hint, location.origin)
	}

	function safeParse(text: string): unknown {
		try {
			return JSON.parse(text)
		} catch {
			return undefined
		}
	}
}
