// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BRIDGE, isRequestHint, type RequestHint } from '../lib/messages'

const CONVERSATION = 'https://chatgpt.com/backend-api/conversation'

const untouched = new Response('original body')
const original = vi.fn(async () => untouched)
const hints: RequestHint[] = []

// The patch wraps whatever fetch it finds, so the stub goes in first and the
// module is imported afterwards.
window.fetch = original as unknown as typeof fetch
window.addEventListener('message', e => {
	if (isRequestHint(e.data)) hints.push(e.data)
})

beforeAll(async () => {
	await import('./interceptor')
})

/** postMessage lands on a task, so let the queue run before asserting. */
async function drain() {
	await new Promise(r => setTimeout(r, 0))
}

function body(model: string, prompt: string) {
	return JSON.stringify({
		model,
		messages: [{ content: { parts: [prompt] } }],
	})
}

/**
 * The listed risk here is breaking the page we are demoing on, so most of
 * these tests are about what the patch does not do.
 */
describe('interceptor', () => {
	it('returns the original response object, not a copy', async () => {
		const res = await fetch(CONVERSATION, {
			method: 'POST',
			body: body('gpt-4o', 'hello'),
		})
		expect(res).toBe(untouched)
		expect(res.bodyUsed).toBe(false)
		await expect(res.text()).resolves.toBe('original body')
	})

	it('forwards the call through with its arguments intact', async () => {
		original.mockClear()
		const init = { method: 'POST', body: '{}' }
		await fetch(CONVERSATION, init)
		expect(original).toHaveBeenCalledWith(CONVERSATION, init)
	})

	it('reports the model and a prompt size, never the prompt itself', async () => {
		await drain()
		hints.length = 0
		await fetch(CONVERSATION, {
			method: 'POST',
			body: body('o3-mini', 'a'.repeat(400)),
		})
		await drain()

		expect(hints).toHaveLength(1)
		expect(hints[0]!.source).toBe(BRIDGE)
		expect(hints[0]!.modelHint).toBe('o3-mini')
		expect(hints[0]!.inputTokens).toBeGreaterThan(50)
		expect(JSON.stringify(hints[0])).not.toContain('aaaa')
	})

	it('stays quiet on requests that are not inference calls', async () => {
		await drain()
		hints.length = 0
		await fetch('https://chatgpt.com/backend-api/settings')
		await drain()
		expect(hints).toHaveLength(0)
	})

	it('survives a body it cannot parse', async () => {
		await expect(
			fetch(CONVERSATION, { method: 'POST', body: 'not json at all' }),
		).resolves.toBe(untouched)
	})
})
