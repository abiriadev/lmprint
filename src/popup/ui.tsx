import type { ReactNode } from 'react'
import { platformLabel } from '../platforms/registry'
import type { PlatformSlice } from '../lib/summary'
import { sig } from '../lib/format'

export function Card({
	children,
	className = '',
}: {
	children: ReactNode
	className?: string
}) {
	return (
		<div
			className={`border-ink-700 bg-ink-800 rounded-lg border p-3 ${className}`}
		>
			{children}
		</div>
	)
}

export function Stat({
	label,
	value,
	range,
}: {
	label: string
	value: string
	range: string
}) {
	return (
		<Card className="flex-1">
			<div className="text-mute text-[10px] tracking-wide uppercase">
				{label}
			</div>
			<div className="mt-1 font-mono text-base leading-none">{value}</div>
			<div className="text-mute mt-1 font-mono text-[10px]">{range}</div>
		</Card>
	)
}

export function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className="text-mute mb-1.5 text-[10px] tracking-wide uppercase">
			{children}
		</div>
	)
}

const BAR_COLOURS = [
	'var(--color-leaf-500)',
	'#2f9e6a',
	'#1f7d52',
	'#14603c',
	'#0d4529',
]

/** Small stacked bar. Its whole job is to show that detection is cross-platform. */
export function PlatformBar({ slices }: { slices: PlatformSlice[] }) {
	const total = slices.reduce((sum, s) => sum + s.wh, 0)
	if (!total) return null

	return (
		<div>
			<div className="bg-ink-700 flex h-2 overflow-hidden rounded-full">
				{slices.map((slice, i) => (
					<div
						key={slice.platform}
						style={{
							width: `${(slice.wh / total) * 100}%`,
							background: BAR_COLOURS[i % BAR_COLOURS.length],
						}}
					/>
				))}
			</div>
			<div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
				{slices.map((slice, i) => (
					<span
						key={slice.platform}
						className="text-mute flex items-center gap-1 text-[10px]"
					>
						<span
							className="inline-block h-2 w-2 rounded-full"
							style={{
								background: BAR_COLOURS[i % BAR_COLOURS.length],
							}}
						/>
						{platformLabel(slice.platform)}
						<span className="font-mono">{sig(slice.wh)} Wh</span>
					</span>
				))}
			</div>
		</div>
	)
}

export function Switch({
	checked,
	onChange,
	label,
}: {
	checked: boolean
	onChange: (v: boolean) => void
	label: string
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			onClick={() => onChange(!checked)}
			className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
				checked ? 'bg-leaf-500' : 'bg-ink-600'
			}`}
		>
			<span
				className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
					checked ? 'left-4.5' : 'left-0.5'
				}`}
			/>
		</button>
	)
}

export function Choice<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T
	options: { id: T; label: string }[]
	onChange: (v: T) => void
}) {
	return (
		<div className="bg-ink-700 flex gap-0.5 rounded-md p-0.5">
			{options.map(option => (
				<button
					key={option.id}
					type="button"
					onClick={() => onChange(option.id)}
					className={`flex-1 rounded px-2 py-1 text-[11px] transition-colors ${
						option.id === value
							? 'bg-leaf-600 text-white'
							: 'text-mute hover:text-white'
					}`}
				>
					{option.label}
				</button>
			))}
		</div>
	)
}

/** Appears on every surface, without exception. */
export function Disclaimer({ onMethodology }: { onMethodology: () => void }) {
	return (
		<div className="text-mute flex items-center justify-between text-[10px]">
			<span>All values are estimates</span>
			<button
				type="button"
				onClick={onMethodology}
				className="text-leaf-500 hover:underline"
			>
				Methodology -&gt;
			</button>
		</div>
	)
}
