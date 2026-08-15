import { describe, expect, it } from 'vitest'
import { estimateTokens } from './tokens'

describe('estimateTokens', () => {
	it('returns zero for empty input', () => {
		expect(estimateTokens('')).toBe(0)
	})

	it('uses about four characters per token for prose', () => {
		const prose = 'the quick brown fox jumps over the lazy dog. '.repeat(10)
		expect(estimateTokens(prose)).toBeCloseTo(prose.length / 4, -1)
	})

	it('packs CJK far denser than latin', () => {
		const cjk = '안녕하세요'.repeat(20)
		const latin = 'a'.repeat(cjk.length)
		expect(estimateTokens(cjk)).toBeGreaterThan(estimateTokens(latin) * 2)
	})

	it('uses the tighter code divisor for multi-line source', () => {
		const code = 'function f(a) {\n  return a;\n}\n'.repeat(4)
		const prose = 'x'.repeat(code.length)
		expect(estimateTokens(code)).toBeGreaterThan(estimateTokens(prose))
	})
})
