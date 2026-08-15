// Generates the extension icons as PNGs with no image-library dependency.
// A dark-green rounded square with a white bolt, drawn by supersampled
// point-in-shape tests and encoded by hand.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons')
const SIZES = [16, 32, 48, 128]
const BG = [22, 101, 52] // #166534, the badge green
const FG = [255, 255, 255]

// Bolt outline in a 0..1 square, traced clockwise from the top.
const BOLT = [
	[0.6, 0.08],
	[0.28, 0.55],
	[0.47, 0.55],
	[0.4, 0.92],
	[0.72, 0.45],
	[0.53, 0.45],
]

function inPolygon(x, y, poly) {
	let inside = false
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i]
		const [xj, yj] = poly[j]
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
			inside = !inside
	}
	return inside
}

function inRoundedSquare(x, y, r) {
	const cx = Math.min(Math.max(x, r), 1 - r)
	const cy = Math.min(Math.max(y, r), 1 - r)
	return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function render(size) {
	const ss = 4 // supersampling factor per axis
	const px = Buffer.alloc(size * size * 4)
	for (let py = 0; py < size; py++) {
		for (let pxi = 0; pxi < size; pxi++) {
			let bg = 0
			let fg = 0
			for (let sy = 0; sy < ss; sy++) {
				for (let sx = 0; sx < ss; sx++) {
					const x = (pxi + (sx + 0.5) / ss) / size
					const y = (py + (sy + 0.5) / ss) / size
					if (!inRoundedSquare(x, y, 0.22)) continue
					bg++
					if (inPolygon(x, y, BOLT)) fg++
				}
			}
			const total = ss * ss
			const alpha = bg / total
			const mix = bg ? fg / bg : 0
			const i = (py * size + pxi) * 4
			for (let c = 0; c < 3; c++)
				px[i + c] = Math.round(BG[c] * (1 - mix) + FG[c] * mix)
			px[i + 3] = Math.round(alpha * 255)
		}
	}
	return px
}

function crc32(buf) {
	let c = ~0
	for (const b of buf) {
		c ^= b
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
	}
	return ~c >>> 0
}

function chunk(type, data) {
	const len = Buffer.alloc(4)
	len.writeUInt32BE(data.length)
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(body))
	return Buffer.concat([len, body, crc])
}

function png(size, pixels) {
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(size, 0)
	ihdr.writeUInt32BE(size, 4)
	ihdr[8] = 8 // bit depth
	ihdr[9] = 6 // truecolour with alpha
	// raw scanlines, each prefixed with filter type 0
	const raw = Buffer.alloc(size * (size * 4 + 1))
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0
		pixels.copy(
			raw,
			y * (size * 4 + 1) + 1,
			y * size * 4,
			(y + 1) * size * 4,
		)
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	])
}

mkdirSync(OUT, { recursive: true })
for (const size of SIZES) {
	writeFileSync(resolve(OUT, `icon-${size}.png`), png(size, render(size)))
	console.log(`icon-${size}.png`)
}
