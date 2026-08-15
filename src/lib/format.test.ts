import { describe, expect, it } from 'vitest'
import {
	energyEquivalent,
	grams,
	litres,
	sig,
	waterEquivalent,
	wh,
} from './format'

describe('units', () => {
	it('never shows more precision than the science supports', () => {
		expect(sig(0.31875)).toBe('0.32')
		expect(sig(12.34)).toBe('12.3')
		expect(sig(1234)).toBe('1234')
	})

	it('switches unit before the number becomes unreadable', () => {
		expect(wh(0.32)).toBe('0.32 Wh')
		expect(wh(2500)).toBe('2.5 kWh')
		expect(litres(0.0007)).toBe('0.7 mL')
		expect(litres(2)).toBe('2.0 L')
		expect(grams(1500)).toBe('1.5 kg')
	})
})

describe('equivalences', () => {
	it('picks a unit that reads as a real quantity', () => {
		// The largest unit that still reads as more than a fraction wins, so a
		// day of use lands on phone charges rather than thousandths of a kettle.
		expect(energyEquivalent(12)).toContain('phone charge')
		expect(energyEquivalent(400)).toContain('kettle')
		expect(energyEquivalent(0.9)).toContain('web searches')
		expect(energyEquivalent(0.1)).toContain('LED bulb')
	})

	it('gives up rather than print a meaningless fraction', () => {
		expect(energyEquivalent(0.0001)).toBeNull()
	})

	it('measures a day of water in sips', () => {
		expect(waterEquivalent(0.05)).toContain('sips')
		expect(waterEquivalent(2)).toContain('bottles')
	})
})
