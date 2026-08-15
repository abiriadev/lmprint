import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig({
	plugins: [react(), tailwindcss(), crx({ manifest })],
	resolve: {
		alias: { '@': resolve(import.meta.dirname, 'src') },
	},
	build: {
		rollupOptions: {
			input: {
				methodology: resolve(
					import.meta.dirname,
					'src/methodology/index.html',
				),
				dashboard: resolve(
					import.meta.dirname,
					'src/dashboard/index.html',
				),
			},
		},
	},
	server: { port: 5173, strictPort: true },
})
