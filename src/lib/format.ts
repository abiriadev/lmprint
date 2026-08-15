import {
	CARBON_EQUIVALENTS,
	ENERGY_EQUIVALENTS,
	WATER_EQUIVALENTS,
	type Equivalence,
} from '../model/constants'
import type { Range } from '../model/types'

/** Two significant figures, which is already more than the science supports. */
export function sig(n: number, digits = 2): string {
	if (!Number.isFinite(n)) return '0'
	if (n === 0) return '0'
	const abs = Math.abs(n)
	if (abs >= 100) return String(Math.round(n))
	if (abs >= 10) return n.toFixed(1)
	if (abs >= 1) return n.toFixed(1)
	return n.toPrecision(digits).replace(/\.?0+$/, '')
}

export function wh(n: number): string {
	if (n >= 1000) return `${sig(n / 1000)} kWh`
	return `${sig(n)} Wh`
}

export function litres(n: number): string {
	if (n < 1) return `${sig(n * 1000)} mL`
	return `${sig(n)} L`
}

export function grams(n: number): string {
	if (n >= 1000) return `${sig(n / 1000)} kg`
	return `${sig(n)} g`
}

export function range(r: Range, unit: (n: number) => string): string {
	return `${unit(r.low)} to ${unit(r.high)}`
}

/**
 * Picks the equivalence that reads best at this magnitude. A unit that always
 * renders "0.001 of a car" teaches nobody anything.
 */
function bestOf(list: Equivalence[], value: number): string | null {
	// Largest unit that still reads as a whole quantity rather than a fraction.
	const pick = list
		.map(eq => ({ eq, count: value / eq.per }))
		.filter(({ count }) => count >= 0.8)
		.sort((a, b) => a.count - b.count)[0]
	if (!pick) return null

	const shown =
		pick.count >= 10
			? String(Math.round(pick.count))
			: trim(sig(pick.count))
	const noun = shown === '1' ? pick.eq.one : pick.eq.label
	return `${shown} ${noun}`
}

/** "1.0" reads like a measurement, "1" reads like a thing. */
function trim(s: string): string {
	return s.replace(/\.0$/, '')
}

export function energyEquivalent(whValue: number): string | null {
	return bestOf(ENERGY_EQUIVALENTS, whValue)
}

export function waterEquivalent(litresValue: number): string | null {
	return bestOf(WATER_EQUIVALENTS, litresValue)
}

export function carbonEquivalent(gramsValue: number): string | null {
	return bestOf(CARBON_EQUIVALENTS, gramsValue)
}

export function scaled(r: Range, factor: number): Range {
	return {
		low: r.low * factor,
		central: r.central * factor,
		high: r.high * factor,
	}
}

export function bigNumber(n: number): string {
	if (n >= 1_000_000) return `${sig(n / 1_000_000)}M`
	if (n >= 1_000) return `${sig(n / 1_000)}k`
	return String(Math.round(n))
}
