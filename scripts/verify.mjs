// Loads dist/ as an unpacked extension in Chromium, then screenshots each
// extension surface. Usage: node scripts/verify.mjs [popup|methodology|dashboard]
import { launch } from 'puppeteer-core'
import { resolve, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')
const SHOTS = resolve(ROOT, 'ignored/shots')

const SURFACES = {
	popup: {
		path: 'src/popup/index.html',
		viewport: { width: 380, height: 640 },
	},
	methodology: {
		path: 'src/methodology/index.html',
		viewport: { width: 900, height: 1400 },
	},
	dashboard: {
		path: 'src/dashboard/index.html',
		viewport: { width: 1100, height: 900 },
	},
}

const only = process.argv[2]
const wanted = only ? [only] : Object.keys(SURFACES)

mkdirSync(SHOTS, { recursive: true })

const browser = await launch({
	executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
	headless: true,
	args: [
		`--disable-extensions-except=${DIST}`,
		`--load-extension=${DIST}`,
		'--no-sandbox',
	],
})

try {
	const worker = await browser.waitForTarget(
		t =>
			t.type() === 'service_worker' &&
			t.url().startsWith('chrome-extension://'),
		{ timeout: 15000 },
	)
	const id = new URL(worker.url()).host
	console.log(`extension id: ${id}`)

	for (const name of wanted) {
		const surface = SURFACES[name]
		if (!surface) throw new Error(`unknown surface: ${name}`)
		const page = await browser.newPage()
		const errors = []
		page.on('pageerror', e => errors.push(String(e)))
		page.on('console', m => {
			if (m.type() === 'error') errors.push(m.text())
		})
		await page.setViewport(surface.viewport)
		await page.goto(`chrome-extension://${id}/${surface.path}`, {
			waitUntil: 'networkidle0',
		})
		await page.screenshot({
			path: resolve(SHOTS, `${name}.png`),
			fullPage: true,
		})
		const text = await page.evaluate(() =>
			document.body.innerText.slice(0, 400),
		)
		console.log(`\n--- ${name} ---\n${text}`)
		if (errors.length)
			console.log(`errors: ${JSON.stringify(errors, null, 2)}`)
		await page.close()
	}
} finally {
	await browser.close()
}
