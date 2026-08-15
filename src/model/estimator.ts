import {
	ASSUMPTION_SETS,
	BAND,
	CLASS_MULTIPLIER,
	EWIF_OFFSITE_L_PER_KWH,
	POWER_MULTIPLIER,
	REGIONS,
	TOKEN_WEIGHT,
	WUE_ONSITE_L_PER_KWH,
} from './constants'
import type { Estimate, InferenceEvent, Range, Settings } from './types'

const MS_PER_HOUR = 3_600_000

function scale(central: number, band: { low: number; high: number }): Range {
	return {
		low: central * band.low,
		central,
		high: central * band.high,
	}
}

function mapRange(r: Range, f: (n: number) => number): Range {
	return { low: f(r.low), central: f(r.central), high: f(r.high) }
}

export function addRanges(a: Range, b: Range): Range {
	return {
		low: a.low + b.low,
		central: a.central + b.central,
		high: a.high + b.high,
	}
}

export const ZERO_RANGE: Range = { low: 0, central: 0, high: 0 }

export const ZERO_ESTIMATE: Estimate = {
	whIT: ZERO_RANGE,
	whSite: ZERO_RANGE,
	gCO2e: ZERO_RANGE,
	litres: ZERO_RANGE,
}

/**
 * Token-based estimator. Trustworthy when the tokens are visible, which is
 * every case except a model that hides its thinking.
 */
export function energyFromTokens(
	ev: InferenceEvent,
	set = ASSUMPTION_SETS.google2025,
): number {
	const mwh =
		ev.inputTokens * set.eInMwhPerToken +
		ev.outputTokens * set.eOutMwhPerToken
	return (mwh / 1000) * CLASS_MULTIPLIER[ev.modelClass]
}

/**
 * Time-based estimator. You cannot see a reasoning model's hidden tokens, but
 * you can see how long it thought, so charge the stream for the accelerator
 * time it occupied.
 */
export function energyFromTime(
	ev: InferenceEvent,
	set = ASSUMPTION_SETS.google2025,
): number {
	const hours = Math.max(ev.streamMs, 0) / MS_PER_HOUR
	return set.pEffWatts * POWER_MULTIPLIER[ev.modelClass] * hours
}

export function estimate(ev: InferenceEvent, settings: Settings): Estimate {
	const set = ASSUMPTION_SETS[settings.assumptionSet]

	if (ev.modelClass === 'image')
		return pipeline(set.imageWh, BAND.image, settings)

	const wToken = ev.reasoning ? TOKEN_WEIGHT.reasoning : TOKEN_WEIGHT.normal
	const itCentral =
		wToken * energyFromTokens(ev, set) +
		(1 - wToken) * energyFromTime(ev, set)
	return pipeline(
		itCentral,
		ev.reasoning ? BAND.reasoning : BAND.normal,
		settings,
	)
}

/**
 * Stages two to four: IT energy, times PUE, into carbon and water. Kept
 * separate so the blocker can price avoided generation the same way.
 */
function pipeline(
	itCentral: number,
	band: { low: number; high: number },
	settings: Settings,
): Estimate {
	const set = ASSUMPTION_SETS[settings.assumptionSet]
	const grid = REGIONS[settings.region].gPerKwh
	const whIT = scale(itCentral, band)
	const whSite = mapRange(whIT, wh => wh * set.pue)
	return {
		whIT,
		whSite,
		gCO2e: mapRange(whSite, wh => (wh / 1000) * grid),
		litres: {
			low: waterLitres(whIT.low, whSite.low),
			central: waterLitres(whIT.central, whSite.central),
			high: waterLitres(whIT.high, whSite.high),
		},
	}
}

/**
 * Onsite cooling evaporates against IT load; upstream generation consumes
 * water for every kWh the facility actually draws. Reporting only the first
 * term is how a published figure ends up ten times too low.
 */
function waterLitres(whIT: number, whSite: number): number {
	return (
		(whIT / 1000) * WUE_ONSITE_L_PER_KWH +
		(whSite / 1000) * EWIF_OFFSITE_L_PER_KWH
	)
}

export function estimateAll(
	events: readonly InferenceEvent[],
	settings: Settings,
): Estimate {
	return events.reduce<Estimate>((acc, ev) => {
		const e = estimate(ev, settings)
		return {
			whIT: addRanges(acc.whIT, e.whIT),
			whSite: addRanges(acc.whSite, e.whSite),
			gCO2e: addRanges(acc.gCO2e, e.gCO2e),
			litres: addRanges(acc.litres, e.litres),
		}
	}, ZERO_ESTIMATE)
}

/** Energy the blocker prevented, priced the same way a real query would be. */
export function estimateAvoided(wh: number, settings: Settings): Estimate {
	return pipeline(wh, BAND.normal, settings)
}
