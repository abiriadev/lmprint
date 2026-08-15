export type ModelClass =
	'mini' | 'standard' | 'frontier' | 'reasoning' | 'image'

export type AssumptionSetId = 'google2025' | 'devries2023'

export type RegionId = 'us' | 'world' | 'ontario' | 'france' | 'poland'

/** How the event reached us. Network detail is an enhancement, never required. */
export type EventSource = 'dom' | 'network' | 'seed'

/**
 * The one interface every phase agrees on. Fields the DOM collector can always
 * fill are required, everything the MAIN-world interceptor adds is optional.
 */
export interface InferenceEvent {
	id: string
	ts: number
	/** Platform registry id, e.g. "chatgpt". */
	platform: string
	outputChars: number
	streamMs: number
	source: EventSource
	modelHint?: string
	modelClass: ModelClass
	reasoning: boolean
	inputTokens: number
	outputTokens: number
}

export interface Range {
	low: number
	central: number
	high: number
}

export interface Estimate {
	/** Accelerator and host energy, before facility overhead. */
	whIT: Range
	/** Energy at the meter, after PUE. */
	whSite: Range
	gCO2e: Range
	/** Litres of water, onsite evaporation plus upstream generation. */
	litres: Range
}

export interface Settings {
	assumptionSet: AssumptionSetId
	/**
	 * Grid the query is charged against. Defaults to the US average because
	 * that is where inference actually runs, not where the user is sitting.
	 */
	region: RegionId
	blockerOn: boolean
}
