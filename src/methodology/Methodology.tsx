import { useStore } from '../lib/useStore'
import {
	ASSUMPTION_SETS,
	BAND,
	CITATIONS,
	CLASS_MULTIPLIER,
	EWIF_OFFSITE_L_PER_KWH,
	OVERVIEW_WH,
	POWER_MULTIPLIER,
	REGIONS,
	TOKEN_WEIGHT,
	WUE_ONSITE_L_PER_KWH,
} from '../model/constants'
import { estimate } from '../model/estimator'
import type {
	AssumptionSetId,
	InferenceEvent,
	ModelClass,
} from '../model/types'
import { DEFAULT_SETTINGS } from '../lib/storage'
import { litres, range, sig, wh } from '../lib/format'

/** The reference query every anchor in this document is quoted against. */
const REFERENCE: InferenceEvent = {
	id: 'reference',
	ts: 0,
	platform: 'chatgpt',
	outputChars: 2000,
	streamMs: 20_000,
	source: 'seed',
	modelClass: 'standard',
	reasoning: false,
	inputTokens: 100,
	outputTokens: 500,
}

function Section({
	title,
	children,
}: {
	title: string
	children: React.ReactNode
}) {
	return (
		<section className="border-ink-700 border-t pt-6">
			<h2 className="mb-3 text-base font-semibold">{title}</h2>
			<div className="flex flex-col gap-3 text-sm leading-relaxed">
				{children}
			</div>
		</section>
	)
}

function Row({ k, v }: { k: string; v: string }) {
	return (
		<div className="border-ink-700 flex justify-between gap-6 border-b py-1.5 last:border-0">
			<span>{k}</span>
			<span className="text-mute shrink-0 font-mono text-xs">{v}</span>
		</div>
	)
}

export function Methodology() {
	const { store, update } = useStore()
	const settings = store?.settings ?? DEFAULT_SETTINGS
	const set = ASSUMPTION_SETS[settings.assumptionSet]
	const reference = estimate(REFERENCE, settings)

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-6 p-10">
			<header>
				<h1 className="text-xl font-semibold">
					LM<span className="text-leaf-500">Print</span> methodology
				</h1>
				<p className="text-mute mt-2 text-sm leading-relaxed">
					Every number this extension shows is an estimate built from
					published figures that disagree with each other by more than
					an order of magnitude. This page lists all of them, says
					which ones we chose, and lets you switch to the other set
					and watch the product move.
				</p>
			</header>

			<Section title="Switch the assumptions">
				<div className="flex flex-wrap gap-2">
					{Object.values(ASSUMPTION_SETS).map(candidate => (
						<button
							key={candidate.id}
							type="button"
							onClick={() =>
								update({
									assumptionSet:
										candidate.id as AssumptionSetId,
								})
							}
							className={`rounded-md px-3 py-1.5 text-xs ${
								candidate.id === set.id
									? 'bg-leaf-600 text-white'
									: 'bg-ink-700 text-mute hover:text-white'
							}`}
						>
							{candidate.label}
						</button>
					))}
				</div>
				<p className="text-mute text-xs">{set.blurb}</p>
				<div className="border-ink-700 bg-ink-800 rounded-lg border p-4">
					<div className="text-mute text-[11px] tracking-wide uppercase">
						Reference query, 500 output tokens over a 20 second
						stream
					</div>
					<div className="mt-2 font-mono text-2xl">
						{wh(reference.whSite.central)}
					</div>
					<div className="text-mute font-mono text-xs">
						{range(reference.whSite, wh)}, and{' '}
						{litres(reference.litres.central)} of water
					</div>
				</div>
				<p className="text-xs">
					That is the same usage under a different published
					methodology. The gap between the two is not a bug in either
					of them, it is the actual state of the evidence, and a tool
					that hides it is telling you something it does not know.
				</p>
			</Section>

			<Section title="The pipeline">
				<pre className="bg-ink-800 border-ink-700 overflow-x-auto rounded-lg border p-4 font-mono text-xs">
					{`tokens + stream duration
   -> IT energy       (two estimators, blended)
   -> site energy     (x PUE ${set.pue})
   -> carbon          (x ${REGIONS[settings.region].gPerKwh} gCO2e/kWh)
   -> water           (onsite evaporation + upstream generation)`}
				</pre>

				<h3 className="mt-2 font-semibold">Estimator A, from tokens</h3>
				<p>
					<code className="font-mono text-xs">
						E = (T_in x {set.eInMwhPerToken} + T_out x{' '}
						{set.eOutMwhPerToken}) mWh x class multiplier
					</code>
				</p>
				<p className="text-mute text-xs">
					A standard chat query producing about 500 output tokens
					should land near 0.3 Wh, which is where the Epoch AI
					estimate and OpenAI's own 0.34 Wh figure both sit.
					Back-solving from that anchor gives{' '}
					{ASSUMPTION_SETS.google2025.eOutMwhPerToken} mWh per output
					token. Prefill batches far better than decode, so input
					tokens are charged at about a tenth of that.
				</p>

				<h3 className="mt-2 font-semibold">
					Estimator B, from the clock
				</h3>
				<p>
					<code className="font-mono text-xs">
						E = {set.pEffWatts} W x power multiplier x stream
						duration
					</code>
				</p>
				<p className="text-mute text-xs">
					You cannot see a reasoning model's hidden thinking tokens,
					but you can see how long it thought. Delivering 0.3 Wh over
					a 20 second stream implies 0.3 / (20/3600) = 54 W of
					accelerator time attributed to that one user, so the central
					figure is 55 W with a 30 to 120 W band. The two estimators
					are calibrated against each other rather than picked
					independently.
				</p>
				<p className="text-mute text-xs">
					Reasoning gets no bump in the power multiplier. Its extra
					work already shows up as extra seconds, and charging for it
					twice would inflate exactly the number people are most
					likely to quote.
				</p>

				<h3 className="mt-2 font-semibold">The blend</h3>
				<p className="text-mute text-xs">
					Normal replies weight the token estimator at{' '}
					{TOKEN_WEIGHT.normal}, because the tokens are visible and
					worth trusting. Reasoning replies flip to{' '}
					{1 - TOKEN_WEIGHT.reasoning} on the clock, because the
					tokens are not.
				</p>
			</Section>

			<Section title="Coefficients in force right now">
				<div>
					<Row
						k="Output token energy"
						v={`${set.eOutMwhPerToken} mWh`}
					/>
					<Row
						k="Input token energy"
						v={`${set.eInMwhPerToken} mWh`}
					/>
					<Row k="Effective stream power" v={`${set.pEffWatts} W`} />
					<Row k="PUE, facility overhead" v={String(set.pue)} />
					<Row k="Image generation" v={`${set.imageWh} Wh`} />
					<Row
						k="Onsite water, against IT load"
						v={`${WUE_ONSITE_L_PER_KWH} L/kWh`}
					/>
					<Row
						k="Upstream water, against site load"
						v={`${EWIF_OFFSITE_L_PER_KWH} L/kWh`}
					/>
					<Row k="Cost of one AI Overview" v={`${OVERVIEW_WH} Wh`} />
				</div>
				<h3 className="mt-2 font-semibold">Model classes</h3>
				<div>
					{(Object.keys(CLASS_MULTIPLIER) as ModelClass[]).map(
						cls => (
							<Row
								key={cls}
								k={cls}
								v={`energy x${CLASS_MULTIPLIER[cls]}, power x${POWER_MULTIPLIER[cls]}`}
							/>
						),
					)}
				</div>
				<h3 className="mt-2 font-semibold">Grids</h3>
				<div>
					{Object.values(REGIONS).map(region => (
						<Row
							key={region.id}
							k={`${region.label}${region.note ? `, ${region.note}` : ''}`}
							v={`${region.gPerKwh} gCO2e/kWh`}
						/>
					))}
				</div>
			</Section>

			<Section title="Why everything is a range">
				<p>
					A normal reply is shown from {BAND.normal.low}x to{' '}
					{BAND.normal.high}x its central estimate. A reasoning reply
					widens to {sig(BAND.reasoning.low)}x and{' '}
					{BAND.reasoning.high}x, because independent estimates for
					reasoning-heavy queries run from about 2 Wh to about 40 Wh
					for the same class of question.
				</p>
				<p>
					That band is deliberately huge and it is the honest shape of
					the evidence. A number rendered alone reads as measured. A
					number with its band under it reads as what it is.
				</p>
			</Section>

			<Section title="Choices worth arguing with">
				<p>
					<strong>We charge the datacenter's grid, not yours.</strong>{' '}
					Your query runs in Virginia or Iowa, not in your living
					room, so the default is the US average at{' '}
					{REGIONS.us.gPerKwh} gCO2e/kWh. Switching to Ontario in the
					popup shows what the same day would have cost on a hydro and
					nuclear grid, which is roughly a twelfth. That difference is
					a fact about where compute is sited, not about how you use
					it.
				</p>
				<p>
					<strong>We report location-based emissions.</strong>{' '}
					Providers buy renewable energy certificates, so their
					market-based reported figures approach zero while the
					electrons on the wire are unchanged. We report the physical
					reality and say so.
				</p>
				<p>
					<strong>We count upstream water.</strong> The reference
					query comes out near {litres(reference.litres.central)}{' '}
					against OpenAI's stated 0.32 mL. Ours is higher because
					theirs is almost certainly onsite evaporation only, and the
					water consumed generating the electricity is real water.
				</p>
				<p>
					<strong>We count more than the accelerator.</strong>{' '}
					Google's 2025 disclosure found that a comprehensive
					accounting, including host CPU and DRAM, idle reserve
					capacity and facility overhead, came out roughly 2.4 times
					higher than a naive accelerator-only calculation. Counting
					only the GPU undercounts by more than half.
				</p>
				<p>
					<strong>We do not read your prompts.</strong> Token counts
					are computed in the page and only the number is stored.
					Nothing readable ever reaches storage, and nothing at all
					leaves your machine.
				</p>
			</Section>

			<Section title="What we do not know">
				<ul className="text-mute list-disc pl-5 text-sm">
					<li>
						Which model actually served a request, when the site
						does not say.
					</li>
					<li>
						How many hidden thinking tokens a reasoning query
						burned. We infer it from the clock.
					</li>
					<li>
						Batch size, hardware generation, and utilisation at that
						moment.
					</li>
					<li>
						The real PUE and WUE of the specific facility, which
						vary by site and season.
					</li>
					<li>
						Training cost amortised per query, which we exclude
						entirely.
					</li>
				</ul>
			</Section>

			<Section title="Sources">
				<div className="flex flex-col gap-3">
					{CITATIONS.map(citation => (
						<div key={citation.url}>
							<div className="text-sm">{citation.claim}</div>
							<a
								href={citation.url}
								target="_blank"
								rel="noreferrer"
								className="text-leaf-500 text-xs hover:underline"
							>
								{citation.source}
							</a>
							{citation.note && (
								<div className="text-mute mt-0.5 text-xs">
									{citation.note}
								</div>
							)}
						</div>
					))}
				</div>
			</Section>

			<footer className="border-ink-700 text-mute border-t pt-6 text-xs">
				All values are estimates. We do not claim to know what a query
				costs. We claim to show you what the published research spans,
				and to cite all of it.
			</footer>
		</main>
	)
}
