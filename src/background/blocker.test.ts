import { describe, expect, it } from 'vitest'
import { isBlockedSearch } from './blocker'
import rules from '../rules.json' with { type: 'json' }

describe('isBlockedSearch', () => {
	it('recognises a search that came back through the Web filter', () => {
		expect(
			isBlockedSearch('https://www.google.com/search?q=kettle&udm=14'),
		).toBe(true)
	})

	it('ignores a normal search, which is the one that generated a summary', () => {
		expect(isBlockedSearch('https://www.google.com/search?q=kettle')).toBe(
			false,
		)
	})

	it('ignores other Google surfaces and other sites', () => {
		expect(isBlockedSearch('https://www.google.com/maps?udm=14')).toBe(
			false,
		)
		expect(isBlockedSearch('https://example.com/search?udm=14')).toBe(false)
		expect(isBlockedSearch('https://notgoogle.com/search?udm=14')).toBe(
			false,
		)
	})

	it('does not throw on something that is not a URL', () => {
		expect(isBlockedSearch('chrome://newtab')).toBe(false)
		expect(isBlockedSearch('')).toBe(false)
	})
})

describe('the ruleset', () => {
	const allow = rules.find(r => r.action.type === 'allow')
	const redirect = rules.find(r => r.action.type === 'redirect')

	it('ships the loop-breaker at a higher priority than the redirect', () => {
		// Without this, udm=14 gets added forever and the tab lands on an error.
		expect(allow).toBeDefined()
		expect(redirect).toBeDefined()
		expect(allow!.priority).toBeGreaterThan(redirect!.priority)
	})

	it('only ever touches top-level Google search navigations', () => {
		for (const rule of rules) {
			expect(rule.condition.resourceTypes).toEqual(['main_frame'])
		}
		expect(redirect!.condition.urlFilter).toContain('google.com/search')
	})

	it('is registered but disabled by default, so the blocker is opt in', async () => {
		const manifest = (await import('../../manifest.json', {
			with: { type: 'json' },
		})) as unknown as {
			default: {
				declarative_net_request: {
					rule_resources: {
						id: string
						enabled: boolean
						path: string
					}[]
				}
			}
		}
		const resource =
			manifest.default.declarative_net_request.rule_resources[0]!
		expect(resource.enabled).toBe(false)
		expect(resource.path).toBe('src/rules.json')
	})
})
