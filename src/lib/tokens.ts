/**
 * js-tiktoken would be exact, but it is about 2 MB of BPE ranks to shave an
 * error well inside the order-of-magnitude spread of the coefficients it feeds.
 * This heuristic is within roughly 10 percent, which is close enough to be
 * invisible in the output.
 */
const CHARS_PER_TOKEN = { latin: 4.0, code: 3.2, cjk: 1.6 }

/** CJK ideographs plus Hangul syllables, which pack far more meaning per char. */
const CJK = /[\u3000-\u9fff\uac00-\ud7af]/g

export function estimateTokens(text: string): number {
	if (!text) return 0
	const cjk = (text.match(CJK) ?? []).length
	const codeish = /[{};()<>=]/.test(text) && text.split('\n').length > 5
	const rest = text.length - cjk
	const divisor = codeish ? CHARS_PER_TOKEN.code : CHARS_PER_TOKEN.latin
	return Math.round(rest / divisor + cjk / CHARS_PER_TOKEN.cjk)
}

/**
 * The collector only ever knows how many characters arrived, not the text,
 * once an event has been persisted. Same divisor, no content needed.
 */
export function tokensFromChars(chars: number): number {
	return Math.round(chars / CHARS_PER_TOKEN.latin)
}
