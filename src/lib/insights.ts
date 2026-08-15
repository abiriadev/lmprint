import { platformLabel } from '../platforms/registry'
import type { DaySummary } from './summary'

/**
 * Deterministic, offline, and it says what an LLM would have said. Not using a
 * model here is the on-theme choice: the recommendation is not worth the
 * energy it would take to generate.
 */
export interface Rule {
	id: string
	when: (d: DaySummary) => boolean
	say: (d: DaySummary) => string
}

const pct = (n: number) => `${Math.round(n * 100)}%`

export const RULES: Rule[] = [
	{
		id: 'reasoning-share',
		when: d => d.events.length >= 3 && d.reasoningShare > 0.3,
		say: d =>
			`Reasoning mode ran on ${pct(d.reasoningShare)} of your queries. It costs roughly six times a standard reply, so switch it off for lookups and short answers.`,
	},
	{
		id: 'short-answers-big-model',
		when: d =>
			d.events.length >= 3 &&
			d.avgOutputTokens < 150 &&
			d.frontierShare > 0.5,
		say: () =>
			'Most of your replies were short but ran on a large model. A smaller one would cut around 85% of the energy with no quality loss for answers this size.',
	},
	{
		id: 'blocked-overviews',
		when: d => d.blockedCount > 5,
		say: d =>
			`You avoided ${d.blockedCount} AI Overviews, about ${d.avoided.whSite.central.toFixed(1)} Wh of generation you never asked for.`,
	},
	{
		id: 'single-platform',
		when: d => d.events.length >= 5 && d.platforms.length === 1,
		say: d =>
			`Everything today went to ${platformLabel(d.platforms[0]!.platform)}. Model choice is the biggest lever you have, and right now you are only pulling one.`,
	},
	{
		id: 'quiet-day',
		when: d => d.events.length > 0 && d.total.whSite.central < 1,
		say: () =>
			'Under a watt-hour today, roughly one minute of a kettle. Individually this is always small, which is exactly why nobody counts it.',
	},
]

export function insightsFor(day: DaySummary, limit = 2): string[] {
	return RULES.filter(rule => rule.when(day))
		.slice(0, limit)
		.map(rule => rule.say(day))
}
