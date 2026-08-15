import { useState } from 'react'
import { useStore } from '../lib/useStore'
import { summarise } from '../lib/summary'
import { insightsFor } from '../lib/insights'
import {
	carbonEquivalent,
	energyEquivalent,
	grams,
	litres,
	range,
	scaled,
	waterEquivalent,
	wh,
} from '../lib/format'
import { loadDemoData } from '../lib/seed'
import { ASSUMPTION_SETS, REGIONS, SCALE_STEPS } from '../model/constants'
import type { AssumptionSetId, RegionId } from '../model/types'
import {
	Card,
	Choice,
	Disclaimer,
	PlatformBar,
	SectionLabel,
	Stat,
	Switch,
} from './ui'

const openPage = (path: string) => {
	void chrome.tabs.create({ url: chrome.runtime.getURL(path) })
}

export function Popup() {
	const { store, update } = useStore()
	const [scale, setScale] = useState(0)

	if (!store) return <div className="text-mute p-5 text-xs">Loading...</div>

	const day = summarise(store)
	const step = SCALE_STEPS[scale]!
	const total = scaled(day.total.whSite, step.factor)
	const water = scaled(day.total.litres, step.factor)
	const carbon = scaled(day.total.gCO2e, step.factor)
	const insights = insightsFor(day)

	return (
		<div className="flex flex-col gap-3 p-4">
			<header className="flex items-baseline justify-between">
				{/*
				 * Double-clicking the wordmark loads a seeded fortnight. Hidden
				 * rather than absent, because a demo on dead venue wifi still has
				 * to have something on screen.
				 */}
				<h1
					className="cursor-default text-sm font-semibold tracking-tight select-none"
					onDoubleClick={() => void loadDemoData()}
					title="LMPrint"
				>
					LM<span className="text-leaf-500">Print</span>
				</h1>
				<span className="text-mute text-[10px]">
					{day.events.length} queries today
				</span>
			</header>

			<section>
				<div className="font-mono text-4xl leading-none">
					{wh(total.central)}
				</div>
				<div className="text-mute mt-1 font-mono text-xs">
					{range(total, wh)}
				</div>
				{energyEquivalent(total.central) && (
					<div className="mt-1.5 text-xs">
						about {energyEquivalent(total.central)}
					</div>
				)}
			</section>

			<div className="flex gap-2">
				<Stat
					label="Energy"
					value={wh(total.central)}
					range={range(total, wh)}
				/>
				<Stat
					label="Water"
					value={litres(water.central)}
					range={range(water, litres)}
				/>
				<Stat
					label="CO2e"
					value={grams(carbon.central)}
					range={range(carbon, grams)}
				/>
			</div>

			<div className="text-mute text-[11px]">
				{[
					waterEquivalent(water.central),
					carbonEquivalent(carbon.central),
				]
					.filter(Boolean)
					.join(', ') || 'Nothing measured yet today'}
			</div>

			{day.platforms.length > 0 && (
				<section>
					<SectionLabel>Where it went</SectionLabel>
					<PlatformBar slices={day.platforms} />
				</section>
			)}

			{day.savings.savedWh > 0 && (
				<Card>
					<div className="text-leaf-400 text-sm">
						You could have used{' '}
						{Math.round(day.savings.share * 100)}% less energy
						today.
					</div>
					<div className="text-mute mt-1 text-[11px]">
						{day.savings.savings.length} of {day.events.length}{' '}
						queries had a cheaper option, worth{' '}
						{wh(day.savings.savedWh)}.
					</div>
				</Card>
			)}

			{insights.map(text => (
				<Card key={text}>
					<div className="text-[11px] leading-relaxed">{text}</div>
				</Card>
			))}

			<section>
				<SectionLabel>Scale</SectionLabel>
				<input
					type="range"
					min={0}
					max={SCALE_STEPS.length - 1}
					value={scale}
					onChange={e => setScale(Number(e.target.value))}
					className="accent-leaf-500 w-full"
					aria-label="Scale the day's footprint to more people"
				/>
				<div className="text-mute text-[11px]">
					{step.factor === 1
						? 'just you'
						: `the same day, multiplied by ${step.label}`}
				</div>
			</section>

			<section>
				<SectionLabel>Assumptions</SectionLabel>
				<Choice<AssumptionSetId>
					value={store.settings.assumptionSet}
					onChange={assumptionSet => update({ assumptionSet })}
					options={Object.values(ASSUMPTION_SETS).map(set => ({
						id: set.id,
						label: set.label,
					}))}
				/>
				<div className="text-mute mt-1.5 text-[10px] leading-relaxed">
					{ASSUMPTION_SETS[store.settings.assumptionSet].blurb}
				</div>
			</section>

			<section>
				<SectionLabel>Grid</SectionLabel>
				<Choice<RegionId>
					value={store.settings.region}
					onChange={region => update({ region })}
					options={[
						{ id: 'us', label: 'US' },
						{ id: 'world', label: 'World' },
						{ id: 'ontario', label: 'Ontario' },
					]}
				/>
				<div className="text-mute mt-1.5 text-[10px]">
					{REGIONS[store.settings.region].gPerKwh} gCO2e/kWh.{' '}
					{REGIONS[store.settings.region].note ??
						'Location-based, not market-based.'}
				</div>
			</section>

			<Card>
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-xs">Block Google AI Overviews</div>
						<div className="text-mute mt-0.5 text-[10px]">
							{day.blockedCount} prevented today,{' '}
							{wh(day.avoided.whSite.central)} never generated
						</div>
					</div>
					<Switch
						label="Block Google AI Overviews"
						checked={store.settings.blockerOn}
						onChange={blockerOn => update({ blockerOn })}
					/>
				</div>
			</Card>

			<button
				type="button"
				onClick={() => openPage('src/dashboard/index.html')}
				className="border-ink-700 text-mute rounded-lg border py-2 text-[11px] hover:text-white"
			>
				Open dashboard
			</button>

			<Disclaimer
				onMethodology={() => openPage('src/methodology/index.html')}
			/>
		</div>
	)
}
