// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { start } from './collector'
import { PLATFORMS } from '../platforms/registry'
import { BRIDGE } from '../lib/messages'
import type { InferenceMessage } from '../lib/messages'

const chatgpt = PLATFORMS.find(p => p.id === 'chatgpt')!

let sent: InferenceMessage[]
let stop: () => void

/** Wraps start() so every test tears its observer down again. */
function collect(platform = chatgpt) {
	stop = start(platform)
}

beforeEach(() => {
	vi.useFakeTimers()
	sent = []
	stop = () => {}
	document.body.innerHTML = ''
	Object.assign(globalThis, {
		chrome: {
			runtime: {
				sendMessage: (m: InferenceMessage) => {
					sent.push(m)
					return Promise.resolve()
				},
			},
		},
	})
})

afterEach(() => {
	stop()
	vi.useRealTimers()
})

/** Types text into an element the way a stream does, one chunk per tick. */
async function stream(el: Element, chunks: string[], msPerChunk = 100) {
	for (const chunk of chunks) {
		el.textContent += chunk
		await Promise.resolve()
		vi.advanceTimersByTime(msPerChunk)
	}
}

function assistantNode() {
	const el = document.createElement('div')
	el.setAttribute('data-message-author-role', 'assistant')
	document.body.append(el)
	return el
}

describe('collector', () => {
	it('reports a reply once the DOM goes quiet', async () => {
		collect()
		const el = assistantNode()
		await stream(el, [
			'Hello there, ',
			'this is a streamed ',
			'assistant reply.',
		])

		expect(sent).toHaveLength(0)
		vi.advanceTimersByTime(1200)
		await Promise.resolve()

		expect(sent).toHaveLength(1)
		expect(sent[0]!.platform).toBe('chatgpt')
		expect(sent[0]!.outputChars).toBe(el.textContent!.length)
		expect(sent[0]!.streamMs).toBeGreaterThan(0)
	})

	it('ignores a reply too short to be one', async () => {
		collect()
		await stream(assistantNode(), ['ok'])
		vi.advanceTimersByTime(1200)
		expect(sent).toHaveLength(0)
	})

	it('counts two replies separately, not cumulatively', async () => {
		collect()
		const first = assistantNode()
		await stream(first, ['The first reply, long enough to count.'])
		vi.advanceTimersByTime(1200)

		const second = assistantNode()
		await stream(second, ['The second reply, also long enough.'])
		vi.advanceTimersByTime(1200)

		expect(sent).toHaveLength(2)
		expect(sent[0]!.outputChars).toBe(first.textContent!.length)
		expect(sent[1]!.outputChars).toBe(second.textContent!.length)
	})

	it('charges only the new text when one reply resumes after a long pause', async () => {
		collect()
		const el = assistantNode()
		await stream(el, ['Thinking about it for a while now.'])
		vi.advanceTimersByTime(1200)
		const firstBurst = sent[0]!.outputChars

		await stream(el, [' And here is the rest of the answer.'])
		vi.advanceTimersByTime(1200)

		expect(sent).toHaveLength(2)
		expect(firstBurst + sent[1]!.outputChars).toBe(el.textContent!.length)
	})

	it('falls back to any growing subtree when the selector has drifted', async () => {
		collect({
			...chatgpt,
			assistantSelectors: ['.selector-that-no-longer-exists'],
		})
		const el = document.createElement('div')
		document.body.append(el)
		await stream(el, ['x'.repeat(120), 'y'.repeat(120), 'z'.repeat(120)])
		vi.advanceTimersByTime(1200)

		expect(sent).toHaveLength(1)
		expect(sent[0]!.outputChars).toBeGreaterThan(200)
	})

	it('attaches the model hint the interceptor found', async () => {
		collect()
		// Dispatched directly rather than via postMessage, which queues a task
		// the fake timers would never run.
		window.dispatchEvent(
			new MessageEvent('message', {
				source: window,
				data: {
					source: BRIDGE,
					platform: 'chatgpt',
					modelHint: 'o3',
					inputTokens: 42,
				},
			}),
		)

		await stream(assistantNode(), [
			'A reply from a reasoning model, at length.',
		])
		vi.advanceTimersByTime(1200)

		expect(sent[0]!.modelHint).toBe('o3')
		expect(sent[0]!.inputTokens).toBe(42)
		expect(sent[0]!.reasoning).toBe(true)
	})
})
