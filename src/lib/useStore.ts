import { useEffect, useState } from 'react'
import { read, setSettings, type Store } from './storage'
import type { Settings } from '../model/types'

/**
 * Reads the store and stays live off chrome.storage.onChanged, so the popup
 * updates while a reply is still streaming in another tab. No polling.
 */
export function useStore() {
	const [store, setStore] = useState<Store | null>(null)

	useEffect(() => {
		let alive = true
		const refresh = () => {
			void read().then(s => {
				if (alive) setStore(s)
			})
		}

		refresh()
		chrome.storage.onChanged.addListener(refresh)
		return () => {
			alive = false
			chrome.storage.onChanged.removeListener(refresh)
		}
	}, [])

	return {
		store,
		update: (patch: Partial<Settings>) => void setSettings(patch),
	}
}
