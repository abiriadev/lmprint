import type { AssumptionSetId, ModelClass, RegionId } from './types'

/**
 * Every coefficient in LMPrint lives here, with the source it came from. The
 * methodology page renders this file directly, so a number that is not
 * described here does not exist in the product.
 *
 * Published per-query estimates span more than an order of magnitude. Rather
 * than pick a winner we ship both ends and let the user switch between them.
 */
export interface AssumptionSet {
	id: AssumptionSetId
	label: string
	blurb: string
	/** Decode energy, the dominant term. Milliwatt-hours per output token. */
	eOutMwhPerToken: number
	/** Prefill batches well, so it is roughly a tenth of decode per token. */
	eInMwhPerToken: number
	/** Effective accelerator power attributed to one user's stream, watts. */
	pEffWatts: number
	/** Power usage effectiveness, the facility overhead multiplier. */
	pue: number
	/** Flat cost of one generated image, watt-hours. */
	imageWh: number
}

export const ASSUMPTION_SETS: Record<AssumptionSetId, AssumptionSet> = {
	google2025: {
		id: 'google2025',
		label: 'Google / OpenAI 2025',
		blurb:
			'Operator self-reported figures. A standard chat reply lands near 0.3 Wh. ' +
			'Cheap, recent, and published by the companies being measured.',
		// Back-solved from the ~0.3 Wh anchor at ~500 output tokens.
		eOutMwhPerToken: 0.55,
		eInMwhPerToken: 0.05,
		// 0.3 Wh delivered over a 20 s stream implies 0.3 / (20/3600) = 54 W.
		pEffWatts: 55,
		pue: 1.12,
		imageWh: 3.0,
	},
	devries2023: {
		id: 'devries2023',
		label: 'de Vries 2023 / EPRI',
		blurb:
			'The earlier independent estimates, around 3 Wh per query, roughly ten ' +
			'times the operator figures. Superseded but not disproven, and the ' +
			'source of most numbers still in circulation.',
		eOutMwhPerToken: 5.5,
		eInMwhPerToken: 0.5,
		pEffWatts: 550,
		pue: 1.56,
		imageWh: 30,
	},
}

export const DEFAULT_ASSUMPTION_SET: AssumptionSetId = 'google2025'

/**
 * Energy relative to a standard chat reply of the same length. The reasoning
 * entry absorbs hidden thinking tokens, which is why its band is so wide.
 */
export const CLASS_MULTIPLIER: Record<ModelClass, number> = {
	mini: 0.15,
	standard: 1.0,
	frontier: 2.5,
	reasoning: 6.0,
	image: 1.0,
}

/**
 * Power draw relative to a standard model, used by the time-based estimator.
 * Reasoning deliberately gets no bump here: the extra work of thinking already
 * shows up as extra seconds on the clock, and charging for it twice would
 * inflate exactly the number people are most likely to quote.
 */
export const POWER_MULTIPLIER: Record<ModelClass, number> = {
	mini: 0.3,
	standard: 1.0,
	frontier: 2.0,
	reasoning: 1.0,
	image: 1.0,
}

/** Blend weight given to the token-based estimator. The clock takes the rest. */
export const TOKEN_WEIGHT = { normal: 0.8, reasoning: 0.3 }

/** Uncertainty band as a multiple of the central estimate. */
export const BAND = {
	normal: { low: 0.4, high: 2.5 },
	// Independent estimates for reasoning-heavy queries run from ~2 Wh to ~40 Wh.
	reasoning: { low: 1 / 3, high: 10 },
	image: { low: 2 / 3, high: 5 / 3 },
}

export interface Region {
	id: RegionId
	label: string
	gPerKwh: number
	note?: string
}

export const REGIONS: Record<RegionId, Region> = {
	us: {
		id: 'us',
		label: 'US average',
		gPerKwh: 369,
		note: 'Default. This is where inference actually runs.',
	},
	world: { id: 'world', label: 'World average', gPerKwh: 475 },
	ontario: {
		id: 'ontario',
		label: 'Ontario',
		gPerKwh: 30,
		note: 'Hydro and nuclear. What the same query would cost on a clean grid.',
	},
	france: { id: 'france', label: 'France', gPerKwh: 56 },
	poland: { id: 'poland', label: 'Poland', gPerKwh: 662 },
}

export const DEFAULT_REGION: RegionId = 'us'

/** Litres of water evaporated per kWh of IT energy, at the datacenter. */
export const WUE_ONSITE_L_PER_KWH = 0.3
/** Litres consumed generating each kWh delivered to the facility. */
export const EWIF_OFFSITE_L_PER_KWH = 2.0

/** Energy an AI Overview costs to generate, charged to whoever prevented it. */
export const OVERVIEW_WH = 0.3

export interface Equivalence {
	id: string
	label: string
	/** Watt-hours per unit, or litres, or grams, depending on the metric. */
	per: number
	unit: string
}

export const ENERGY_EQUIVALENTS: Equivalence[] = [
	{ id: 'phone', label: 'phone charge', per: 12, unit: 'Wh' },
	{ id: 'bulb', label: 'minutes of a 9 W LED bulb', per: 9 / 60, unit: 'Wh' },
	{ id: 'kettle', label: 'kettle boil', per: 110, unit: 'Wh' },
	{ id: 'search', label: 'web searches', per: 0.3, unit: 'Wh' },
]

export const WATER_EQUIVALENTS: Equivalence[] = [
	{ id: 'sip', label: 'sips of water', per: 0.03, unit: 'L' },
	{ id: 'bottle', label: 'bottles of water', per: 0.5, unit: 'L' },
]

export const CARBON_EQUIVALENTS: Equivalence[] = [
	{ id: 'car', label: 'metres driven', per: 0.17, unit: 'g' },
]

/** Populations the scale slider steps through. */
export const SCALE_STEPS = [
	{ factor: 1, label: 'you' },
	{ factor: 30, label: 'your team' },
	{ factor: 1_000, label: 'a school' },
	{ factor: 1_000_000, label: 'a million users' },
]

export interface Citation {
	claim: string
	source: string
	url: string
	note?: string
}

export const CITATIONS: Citation[] = [
	{
		claim: 'About 0.3 Wh per GPT-4o class text query',
		source: 'Epoch AI (2025)',
		url: 'https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use',
	},
	{
		claim: '0.34 Wh and 0.32 mL of water per average query',
		source: 'Sam Altman, "The Gentle Singularity" (June 2025)',
		url: 'https://blog.samaltman.com/the-gentle-singularity',
		note: 'Stated without supporting methodology. Almost certainly onsite water only.',
	},
	{
		claim: '0.24 Wh median Gemini text prompt; comprehensive accounting about 2.4x the naive accelerator-only figure',
		source: 'Google, "Measuring the environmental impact of AI inference" (Aug 2025)',
		url: 'https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference',
	},
	{
		claim: 'About 3 Wh per query, kept as the alternate assumption set',
		source: 'de Vries, "The growing energy footprint of AI" (2023)',
		url: 'https://doi.org/10.1016/j.joule.2023.09.004',
	},
	{
		claim: 'Per-inference energy by task type; image generation around 2.9 Wh',
		source: 'Luccioni, Jernite and Strubell, "Power Hungry Processing" (2024)',
		url: 'https://arxiv.org/abs/2311.16863',
	},
	{
		claim: 'Reasoning-model queries around 18 Wh on average, up to about 40 Wh',
		source: 'University of Rhode Island AI lab estimate (2025)',
		url: 'https://arxiv.org/abs/2505.09598',
		note: 'Very wide uncertainty. This is the upper end of our reasoning band.',
	},
	{
		claim: 'Datacenter water use and WUE',
		source: 'Li et al., "Making AI Less Thirsty" (2023)',
		url: 'https://arxiv.org/abs/2304.03271',
	},
	{
		claim: 'US grid carbon intensity 369 gCO2e/kWh',
		source: 'US EPA eGRID',
		url: 'https://www.epa.gov/egrid',
	},
	{
		claim: 'World average 475 gCO2e/kWh',
		source: 'IEA',
		url: 'https://www.iea.org/reports/electricity-2024',
	},
	{
		claim: 'On the misuse and misquotation of all of the above',
		source: 'Misinformation by Omission (arXiv:2506.15572)',
		url: 'https://arxiv.org/abs/2506.15572',
		note: 'The failure mode this project is trying not to repeat.',
	},
]
