// Drives the built extension without touching any AI service: sends inference
// events straight to the service worker and reports the badge after each one.
// Use it to rehearse the demo, or to check the accounting end to end when the
// venue wifi is gone.
//
//   node scripts/simulate.mjs
import { launch } from 'puppeteer-core'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')

const SCRIPT = [
	{
		label: 'a normal ChatGPT reply, about 500 tokens',
		platform: 'chatgpt',
		modelHint: 'gpt-4o',
		outputChars: 2000,
		streamMs: 20_000,
		reasoning: false,
		inputTokens: 100,
	},
	{
		label: 'a long Claude reply',
		platform: 'claude',
		modelHint: 'claude-sonnet-4-6',
		outputChars: 3600,
		streamMs: 28_000,
		reasoning: false,
	},
	{
		label: 'the same question with thinking on',
		platform: 'chatgpt',
		modelHint: 'o3',
		outputChars: 1500,
		streamMs: 120_000,
		reasoning: true,
	},
	{
		label: 'a two-word Gemini exchange',
		platform: 'gemini',
		outputChars: 40,
		streamMs: 1_500,
		reasoning: false,
	},
]

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
	const target = await browser.waitForTarget(
		t =>
			t.type() === 'service_worker' &&
			t.url().startsWith('chrome-extension://'),
		{ timeout: 15000 },
	)
	const id = new URL(target.url()).host
	const worker = await target.worker()
	const badge = () => worker.evaluate(() => chrome.action.getBadgeText({}))

	// Messages have to come from an extension context, so the popup stands in
	// for the content script here.
	const page = await browser.newPage()
	await page.goto(`chrome-extension://${id}/src/popup/index.html`, {
		waitUntil: 'networkidle0',
	})

	console.log(`badge starts at ${await badge()} Wh`)
	for (const { label, ...event } of SCRIPT) {
		const reply = await page.evaluate(m => chrome.runtime.sendMessage(m), {
			type: 'inference',
			ts: Date.now(),
			...event,
		})
		await new Promise(r => setTimeout(r, 300))
		console.log(
			`${label}\n  class ${reply?.event?.modelClass}, badge now ${await badge()} Wh`,
		)
	}
} finally {
	await browser.close()
}
