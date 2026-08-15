import { useState } from 'react'
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'
import { useStore } from '../lib/useStore'
import { summarise, trend } from '../lib/summary'
import { insightsFor } from '../lib/insights'
import { estimate } from '../model/estimator'
import { platformLabel } from '../platforms/registry'
import { dayKey, recentDays } from '../lib/storage'
import {
	carbonEquivalent,
	energyEquivalent,
	grams,
	litres,
	range,
	sig,
	waterEquivalent,
	wh,
} from '../lib/format'
import type { ModelClass } from '../model/types'

const AXIS = { stroke: '#8ba096', fontSize: 11 }
const GRID = '#26302b'
const LEAF = '#3fbf7f'

const CLASS_COLOURS: Record<ModelClass, string> = {
	mini: '#5fd79a',
	standard: '#3fbf7f',
	frontier: '#2f9e6a',
	reasoning: '#1f7d52',
	image: '#14603c',
}

function Panel({
	title,
	children,
	className = '',
}: {
	title: string
	children: React.ReactNode
	className?: string
}) {
	return (
		<section
			className={`border-ink-700 bg-ink-800 rounded-xl border p-5 ${className}`}
		>
			<h2 className="text-mute mb-4 text-[11px] tracking-wide uppercase">
				{title}
			</h2>
			{children}
		</section>
	)
}

/** Short label for an axis, "08-15" rather than the whole date. */
const short = (key: string) => key.slice(5)

export function Dashboard() {
	const { store } = useStore()
	const [selected, setSelected] = useState<string>(dayKey())

	if (!store)
		return <main className="text-mute p-10 text-sm">Loading...</main>

	const days = trend(store, 14)
	const day = summarise(store, selected)
	const insights = insightsFor(day, 4)

	const byClass = new Map<ModelClass, number>()
	for (const ev of day.events) {
		byClass.set(
			ev.modelClass,
			(byClass.get(ev.modelClass) ?? 0) +
				estimate(ev, store.settings).whSite.central,
		)
	}
	const classData = [...byClass.entries()]
		.map(([modelClass, value]) => ({ modelClass, wh: value }))
		.sort((a, b) => b.wh - a.wh)

	const fortnight = days.reduce((sum, d) => sum + d.wh, 0)
	const queries = days.reduce((sum, d) => sum + d.events, 0)

	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-4 p-8">
			<header className="flex items-end justify-between">
				<div>
					<h1 className="text-lg font-semibold">
						LM<span className="text-leaf-500">Print</span> dashboard
					</h1>
					<p className="text-mute mt-1 text-xs">
						{recentDays().length} days of history, kept on this
						machine only
					</p>
				</div>
				<div className="text-right">
					<div className="font-mono text-3xl leading-none">
						{wh(fortnight)}
					</div>
					<div className="text-mute text-xs">
						over {queries} queries in two weeks
					</div>
				</div>
			</header>

			<Panel title="Energy per day, watt-hours at the meter">
				<div className="h-56">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart
							data={days}
							onClick={state => {
								const key = state?.activeLabel
								if (typeof key === 'string') setSelected(key)
							}}
						>
							<defs>
								<linearGradient
									id="fill"
									x1="0"
									y1="0"
									x2="0"
									y2="1"
								>
									<stop
										offset="0%"
										stopColor={LEAF}
										stopOpacity={0.5}
									/>
									<stop
										offset="100%"
										stopColor={LEAF}
										stopOpacity={0}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid stroke={GRID} vertical={false} />
							<XAxis
								dataKey="key"
								tickFormatter={short}
								{...AXIS}
							/>
							<YAxis {...AXIS} width={40} />
							<Tooltip
								contentStyle={{
									background: '#121815',
									border: `1px solid ${GRID}`,
									borderRadius: 8,
									fontSize: 12,
								}}
								formatter={(value: unknown) => [
									wh(Number(value)),
									'energy',
								]}
							/>
							<Area
								type="monotone"
								dataKey="wh"
								stroke={LEAF}
								strokeWidth={2}
								fill="url(#fill)"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
				<p className="text-mute mt-2 text-[11px]">
					Click a day to inspect it below.
				</p>
			</Panel>

			<div className="grid grid-cols-3 gap-4">
				<Panel title={`Energy on ${selected}`}>
					<div className="font-mono text-2xl">
						{wh(day.total.whSite.central)}
					</div>
					<div className="text-mute mt-1 font-mono text-[11px]">
						{range(day.total.whSite, wh)}
					</div>
					<div className="mt-2 text-xs">
						{energyEquivalent(day.total.whSite.central) ??
							'nothing measured'}
					</div>
				</Panel>
				<Panel title="Water">
					<div className="font-mono text-2xl">
						{litres(day.total.litres.central)}
					</div>
					<div className="text-mute mt-1 font-mono text-[11px]">
						{range(day.total.litres, litres)}
					</div>
					<div className="mt-2 text-xs">
						{waterEquivalent(day.total.litres.central) ??
							'nothing measured'}
					</div>
				</Panel>
				<Panel title="Carbon">
					<div className="font-mono text-2xl">
						{grams(day.total.gCO2e.central)}
					</div>
					<div className="text-mute mt-1 font-mono text-[11px]">
						{range(day.total.gCO2e, grams)}
					</div>
					<div className="mt-2 text-xs">
						{carbonEquivalent(day.total.gCO2e.central) ??
							'nothing measured'}
					</div>
				</Panel>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<Panel title="Where the energy went, by model class">
					{classData.length === 0 ? (
						<p className="text-mute text-xs">
							Nothing logged on this day.
						</p>
					) : (
						<div className="h-48">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={classData} layout="vertical">
									<CartesianGrid
										stroke={GRID}
										horizontal={false}
									/>
									<XAxis type="number" {...AXIS} />
									<YAxis
										type="category"
										dataKey="modelClass"
										width={80}
										{...AXIS}
									/>
									<Tooltip
										cursor={{ fill: '#1a221e' }}
										contentStyle={{
											background: '#121815',
											border: `1px solid ${GRID}`,
											borderRadius: 8,
											fontSize: 12,
										}}
										formatter={(value: unknown) => [
											wh(Number(value)),
											'energy',
										]}
									/>
									<Bar dataKey="wh" radius={[0, 4, 4, 0]}>
										{classData.map(entry => (
											<Cell
												key={entry.modelClass}
												fill={
													CLASS_COLOURS[
														entry.modelClass
													]
												}
											/>
										))}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
						</div>
					)}
				</Panel>

				<Panel title="Per platform">
					<div className="flex flex-col gap-2">
						{day.platforms.length === 0 && (
							<p className="text-mute text-xs">
								Nothing logged on this day.
							</p>
						)}
						{day.platforms.map(slice => (
							<div key={slice.platform}>
								<div className="flex justify-between text-xs">
									<span>{platformLabel(slice.platform)}</span>
									<span className="text-mute font-mono">
										{sig(slice.wh)} Wh over {slice.events}{' '}
										queries
									</span>
								</div>
								<div className="bg-ink-700 mt-1 h-1.5 overflow-hidden rounded-full">
									<div
										className="bg-leaf-500 h-full"
										style={{
											width: `${(slice.wh / day.platforms[0]!.wh) * 100}%`,
										}}
									/>
								</div>
							</div>
						))}
					</div>
				</Panel>
			</div>

			<Panel title="What could have been cheaper">
				{day.savings.savedWh > 0 ? (
					<>
						<div className="text-leaf-400 text-lg">
							{Math.round(day.savings.share * 100)}% of this day
							was avoidable, about {wh(day.savings.savedWh)}.
						</div>
						<div className="mt-3 grid grid-cols-3 gap-4 text-xs">
							{(
								[
									['avoidable', 'did not need a model'],
									['reasoningOff', 'thinking left on'],
									['smallerModel', 'oversized model'],
								] as const
							).map(([kind, label]) => (
								<div
									key={kind}
									className="border-ink-700 rounded-lg border p-3"
								>
									<div className="font-mono text-base">
										{day.savings.byKind[kind].count}
									</div>
									<div className="text-mute mt-1">
										{label}
									</div>
									<div className="text-mute font-mono">
										{wh(day.savings.byKind[kind].wh)}
									</div>
								</div>
							))}
						</div>
					</>
				) : (
					<p className="text-mute text-xs">
						Nothing on this day had an obviously cheaper
						alternative.
					</p>
				)}
			</Panel>

			{insights.length > 0 && (
				<Panel title="Insights">
					<ul className="flex flex-col gap-2 text-sm">
						{insights.map(text => (
							<li
								key={text}
								className="text-mute leading-relaxed"
							>
								{text}
							</li>
						))}
					</ul>
				</Panel>
			)}

			<footer className="text-mute flex justify-between pt-2 text-xs">
				<span>All values are estimates</span>
				<a
					href="../methodology/index.html"
					className="text-leaf-500 hover:underline"
				>
					Methodology -&gt;
				</a>
			</footer>
		</main>
	)
}
