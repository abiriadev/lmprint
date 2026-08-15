# LMPrint — Build Plan

A Chrome extension that estimates the energy, water, and carbon footprint of your AI chatbot usage.

**Status of this document:** implementation-ready plan. Assumes a team of 2–4 with ~30 working hours before demo. Adjust the hour budgets in §7, not the scope order.

---

## 1. Decision: Manifest V3 extension, not a Tampermonkey userscript

**Use MV3.** It wins on all three criteria you said you care about, and the criteria you said you *don't* care about (compatibility, maintainability) are exactly where userscripts would have won.

| Criterion | Userscript (Tampermonkey) | MV3 extension | Winner |
|---|---|---|---|
| **1. Demonstration** | Demo step becomes *two* installs: Tampermonkey from the Web Store, then a raw-JS install dialog with a scary permissions list. No toolbar icon, no badge. Your UI has to be an injected floating div. | One step: `chrome://extensions` → Developer mode → Load unpacked. Real icon in the toolbar, **live badge counter on the icon**, real popup, real full-page dashboard. | **MV3** |
| **2. Features** | `GM_setValue` gives cross-origin storage, so basic tracking works. But: no badge, no dedicated extension page, no `declarativeNetRequest` (so the AI-Overview blocker degrades to a visible page flash). | Badge, popup, options page, dashboard at `chrome-extension://…/dashboard.html`, `declarativeNetRequest` for pre-request redirect, `chrome.alarms`, `chrome.storage`. | **MV3** |
| **3. Impl. + test speed** | Faster *only* for a single file with no build step. The moment you want TypeScript + React + Tailwind you're fighting `@resource`, CSP, and manual bundling. No HMR. | `npm create vite` + `@crxjs/vite-plugin` ≈ 15 min to a working scaffold, then **hot module reload on the popup and dashboard** — which is where 70% of your dev time goes. | **MV3** |

The deciding argument: **your stack is a UI stack.** TypeScript + React + Tailwind is worth using only if you have real UI surfaces, and in an extension those surfaces are the popup and the dashboard page. Those are MV3's home turf. A userscript would push you back to vanilla DOM injection, throwing away your team's comfort zone.

**One real MV3 gotcha to plan around:** the background service worker is *ephemeral* — Chrome kills it after ~30s idle. Never hold state in a module-level variable in the service worker. All state goes to `chrome.storage.local`, every time. This costs you about 20 minutes of confusion if you don't know it, and 4 hours if you do it wrong.

**Do not attempt to publish to the Chrome Web Store.** Review takes days. "Load unpacked" is the demo, and honestly it looks *more* impressive to judges — it signals you built it rather than downloaded it.

---

## 2. Feasibility: yes, with one hard scope cut

The concept is solid and the engineering is well within a hackathon. But there's a specific trap in your brief, and one genuine risk.

**The trap:** the natural instinct is to spend 80% of your time on detection coverage — getting all five platforms working perfectly. Don't. Detection is a long tail of brittle CSS selectors that break without warning. **Three platforms working flawlessly beats five platforms working 70% of the time**, especially when a judge is watching. Build the registry so it *looks* trivially extensible (it will be), then populate three entries well.

**The genuine risk:** this category of project is very easy to do badly, and judges have seen the bad version. The bad version prints `2.34g CO₂` with false precision and no sourcing. Published per-query estimates span **more than an order of magnitude** — from 0.24 Wh to 3 Wh for the *same class of query*, depending on whose methodology you use. A tool that hides that spread is misinformation with a nice UI.

**So make that your differentiator.** LMPrint should:
- Show every number as a **range**, not a point value.
- Ship a **methodology page** citing every coefficient, reachable in one click from the popup.
- Let the user **toggle the assumption set** (Google's 2025 self-reported figures vs. the older de Vries 2023 figures) and *watch the numbers move by 10×* on screen.

That last one is the single best demo beat available to you. It takes ~40 minutes to build and it converts your project from "another carbon counter" into "a tool that teaches you why nobody actually knows." That's a sustainability *and* innovation story, which is exactly your two themes.

### Scope verdict on your three optional features

| Feature | Verdict |
|---|---|
| Full backend + dashboard | **Cut the backend entirely.** `chrome.storage.local` is your database. Build the dashboard as a static extension page reading from the same store — it costs you ~3 hours and gives you the "trends" visual with zero server, zero auth, zero deploy risk. |
| AI recommendation engine | **Cut the LLM.** Ship a rules-based "insight" engine (~60 lines, §5.4). It produces the same demo output, runs offline, and can't hallucinate on stage. Ironic bonus: you can say "we didn't use an LLM here because it wasn't worth the energy" — judges will remember that line. |
| AI blocker | **Keep it, it's cheap.** ~30 lines and it's your strongest interactive moment. See §6 — yes, it's blockable client-side, and better than you think. |

---

## 3. Architecture

```
lmprint/
├── manifest.json
├── vite.config.ts
├── src/
│   ├── platforms/
│   │   └── registry.ts            # ← the "configurable list" from the brief
│   ├── inject/
│   │   └── interceptor.ts         # MAIN world: patches fetch, reads request bodies
│   ├── content/
│   │   └── collector.ts           # ISOLATED world: DOM observer + message bridge
│   ├── background/
│   │   └── service-worker.ts      # accounting, storage writes, badge, DNR rules
│   ├── model/
│   │   ├── constants.ts           # every coefficient + its citation
│   │   └── estimator.ts           # the science (§4)
│   ├── lib/
│   │   ├── storage.ts
│   │   ├── tokens.ts
│   │   └── insights.ts
│   ├── popup/                     # React + Tailwind — PRIORITY 1
│   ├── dashboard/                 # React + Tailwind — PRIORITY 3
│   └── methodology/               # static page, citations — PRIORITY 2
└── public/icons/
```

**Data flow:**

```
AI page
  ├─ interceptor.ts (MAIN world)     → sees fetch() call, model name, prompt text, t₀
  │        │ window.postMessage
  │        ▼
  ├─ collector.ts (ISOLATED world)   → MutationObserver on response DOM
  │        │                            counts chars, measures stream duration
  │        │ chrome.runtime.sendMessage
  │        ▼
service-worker.ts                    → estimator.ts → chrome.storage.local
         │                                          → badge text update
         │ chrome.storage.onChanged
         ▼
    popup / dashboard (live, no polling)
```

Two content scripts is the key structural choice. The MAIN-world script can touch `window.fetch` (which the page uses) but has no `chrome.*` APIs. The ISOLATED-world script has `chrome.*` but can't see the page's `fetch`. They talk via `window.postMessage`. MV3 supports declaring MAIN-world content scripts right in the manifest — no more `script.src = chrome.runtime.getURL(...)` dance.

---

## 4. The estimation model

This is the intellectual core. Get it right and the rest is CRUD.

### 4.1 Detection strategy: DOM-primary, network-enhanced

**Default (must work):** MutationObserver watches the assistant response container. Every mutation, sample `textContent.length`. First mutation → TTFT. Last mutation + 1200ms debounce → stream end. This gives you output characters and stream duration, and it **cannot break the host page.**

**Enhancement (nice to have):** the MAIN-world `fetch` patch reads the *request* body only — giving you the exact model name (`gpt-4o`, `claude-sonnet-4-6`, etc.) and prompt text — and records `t₀`. It returns the original `Response` object completely untouched.

> **Strong recommendation: do not `tee()` the response stream.** It's tempting — you'd get exact SSE token counts. But reconstructing a `Response` from a teed branch can break ChatGPT's streaming in ways that only appear under load. You'd be shipping a change that might break the app you're demoing on. Read the request, leave the response alone, let the DOM tell you about the output. Put the tee behind a feature flag if someone has spare time on day 2.

### 4.2 Characters → tokens

```ts
// src/lib/tokens.ts
const CHARS_PER_TOKEN = { latin: 4.0, code: 3.2, cjk: 1.6 };

export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) ?? []).length;
  const codeish = /[{};()<>=]/.test(text) && text.split("\n").length > 5;
  const rest = text.length - cjk;
  const divisor = codeish ? CHARS_PER_TOKEN.code : CHARS_PER_TOKEN.latin;
  return Math.round(rest / divisor + cjk / CHARS_PER_TOKEN.cjk);
}
```

`js-tiktoken` would be exact, but it's ~2MB of BPE ranks and the heuristic is within ~10% — well inside your error bars. Skip it.

### 4.3 The four-stage pipeline

```
tokens + duration → E_IT → × PUE → E_site → × grid intensity → CO₂e
                                            → × water factors → litres
```

**Stage 1 — IT energy, two independent estimators.**

*Estimator A (token-based):*
```
E_A = (T_in × e_in + T_out × e_out) × modelClassMultiplier
```
Anchor: a standard chat query producing ~500 output tokens should land at ~0.3 Wh, which is where Epoch AI's GPT-4o estimate and OpenAI's own 0.34 Wh figure both sit. That back-solves to **e_out = 0.55 mWh/token**. Prefill is far cheaper per token than decode because it batches well — use **e_in = 0.05 mWh/token** (≈10%).

*Estimator B (time-based):* this is the creative bit your brief asked for. For reasoning models you cannot see the hidden thinking tokens — but you *can* see how long the model thought. Treat the user's stream as occupying a share of accelerator power:
```
E_B = P_eff × streamDuration
```
Self-consistency check: 0.3 Wh delivered over a 20-second stream implies `0.3 Wh ÷ (20/3600 h) ≈ 54 W`. So **P_eff = 55 W** central, with a 30–120 W band. Show this derivation on the methodology page — it demonstrates the two estimators are calibrated against each other rather than pulled from thin air.

*Blend:* weight A at 0.8 for normal chat (tokens are visible, trust them). Flip to weight B at 0.7 for reasoning mode (tokens are hidden, trust the clock).

**Model class multipliers:**

| Class | Multiplier | Examples |
|---|---|---|
| `mini` | 0.15 | GPT-4o-mini, Haiku, Flash-Lite |
| `standard` | 1.0 | GPT-4o, Sonnet, Gemini Pro |
| `frontier` | 2.5 | Opus-class |
| `reasoning` | 6.0 (wide band: 2–60) | o-series, thinking modes |
| `image` | fixed 3.0 Wh/image (band 2–5) | DALL·E, Imagen |

The reasoning band is deliberately huge and that's honest: independent estimates for reasoning-heavy queries range from ~2 Wh up to ~18–40 Wh. **Make the reasoning multiplier visible in the UI** — "this one query ≈ 50 normal queries" is your most quotable stat.

**Stage 2 — facility overhead.** `E_site = E_IT × PUE`, PUE = **1.12** (hyperscale default; offer 1.56 industry-average as a toggle).

Worth noting on the methodology page: Google's own 2025 disclosure found that a *comprehensive* accounting — including host CPU/DRAM, idle reserve capacity, and overhead — came out roughly 2.4× higher than a naive accelerator-only calculation. If you only count the GPU, you undercount by more than half.

**Stage 3 — carbon.** `CO₂e = E_site × I_grid`.

| Region | gCO₂e/kWh | Note |
|---|---|---|
| US average | 369 | **default** — this is where inference actually runs |
| World average | 475 | |
| Ontario | ~30 | your home grid — hydro + nuclear |

Two sophisticated points to surface in the UI, both cheap to implement and both very good in a Q&A:
1. **Use the datacenter's grid, not the user's.** Your query runs in Virginia or Iowa, not Toronto. Offer "what if it ran on my grid?" as a toggle — Ontario's clean grid makes the number drop ~10×, which is a genuinely interesting result about *where* compute is sited.
2. **Location-based vs market-based accounting.** Providers buy renewable energy certificates, so their *market-based* reported emissions approach zero while the electrons on the wire are unchanged. LMPrint reports location-based (physical reality) and says so.

**Stage 4 — water.**
```
W = E_IT × WUE_onsite + E_site × EWIF_offsite
```
- `WUE_onsite = 0.30 L/kWh` (evaporative cooling at the datacenter; band 0–2.0)
- `EWIF_offsite = 2.0 L/kWh` (water consumed generating the electricity)

Sanity check: 0.3 Wh × 2.3 L/kWh ≈ **0.7 mL** per query, against OpenAI's stated 0.32 mL. Yours is higher because theirs is almost certainly onsite-only. Say this out loud in the methodology — noticing that a company's published figure excludes upstream water is exactly the kind of analysis that wins a sustainability track.

### 4.4 Ranges, not points

Every estimate carries `{ low, central, high }`. Rule of thumb: `low = 0.4 × central`, `high = 2.5 × central`, widened for reasoning mode. **Render the range everywhere** — a number with a band under it reads as scientific; a number alone reads as made up.

### 4.5 Equivalences

Pick equivalences sized to a *day* of use (~5–50 Wh), not a year. Big units that always read "0.001" are useless.

| Unit | Value |
|---|---|
| Smartphone charge | 12 Wh |
| LED bulb | 9 W → minutes |
| Kettle boil | 110 Wh |
| Google search | 0.3 Wh |
| Bottle of water | 500 mL |
| Car (ICE) | 170 gCO₂/km |

Then the **scale slider**: "×1 (you) → ×30 (your team) → ×1,000,000 users". Individual AI footprints are genuinely small — that's the honest finding, and pretending otherwise is the greenwashing failure mode. The slider lets you be honest *and* still land the impact, by showing the aggregate. Lean into it: *"Your personal footprint is about one kettle boil. That's the point — it's invisible individually, which is exactly why nobody counts it."*

### 4.6 The savings engine

For each logged event, compute the counterfactual:

| Counterfactual | Applies when | Typical saving |
|---|---|---|
| Same query on a `mini` model | model class was `standard`+ and output < 300 tokens | ~85% |
| Reasoning off | `reasoning` mode on a factual/short query | ~80% |
| Query avoided entirely | matches trivial patterns (`thanks`, `hi`, arithmetic) | 100% |
| AI Overview blocked | counter from the blocker | 0.3 Wh each |

Headline: *"You could have used 62% less energy today — 9 of your 14 queries didn't need a frontier model."*

---

## 5. Implementation

### 5.1 Scaffold (30 min)

```bash
npm create vite@latest lmprint -- --template react-ts
cd lmprint
npm i -D @crxjs/vite-plugin@beta tailwindcss @tailwindcss/vite
npm i recharts
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
});
```

### 5.2 manifest.json

```json
{
  "manifest_version": 3,
  "name": "LMPrint",
  "version": "0.1.0",
  "description": "Estimate the energy, water and carbon footprint of your AI chatbot usage.",
  "permissions": ["storage", "declarativeNetRequest", "tabs"],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://www.perplexity.ai/*",
    "https://github.com/*",
    "https://www.google.com/*"
  ],
  "background": { "service_worker": "src/background/service-worker.ts", "type": "module" },
  "action": { "default_popup": "src/popup/index.html", "default_title": "LMPrint" },
  "content_scripts": [
    {
      "matches": ["https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*", "https://www.perplexity.ai/*", "https://github.com/copilot*"],
      "js": ["src/content/collector.ts"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://chatgpt.com/*", "https://claude.ai/*"],
      "js": ["src/inject/interceptor.ts"],
      "world": "MAIN",
      "run_at": "document_start"
    }
  ],
  "declarative_net_request": {
    "rule_resources": [{ "id": "ruleset", "enabled": false, "path": "rules.json" }]
  }
}
```

Note `"world": "MAIN"` — this is the MV3 feature that makes the whole interception approach clean. Note also the ruleset ships **disabled** so the blocker is opt-in (and so you can toggle it live on stage).

### 5.3 Platform registry — the "configurable list"

```ts
// src/platforms/registry.ts
export type ModelClass = "mini" | "standard" | "frontier" | "reasoning" | "image";

export interface PlatformConfig {
  id: string;
  label: string;
  hostPattern: RegExp;
  /** Ordered fallbacks — first selector that matches non-empty wins. */
  assistantSelectors: string[];
  /** Endpoints treated as inference calls (MAIN-world interceptor). */
  endpoints?: RegExp[];
  extractPrompt?: (body: any) => string;
  extractModel?: (body: any) => string | undefined;
  classify: (modelHint?: string) => ModelClass;
}

const byName = (h = ""): ModelClass => {
  const s = h.toLowerCase();
  if (/mini|haiku|flash|lite|nano/.test(s)) return "mini";
  if (/o[1-9]|think|reason/.test(s)) return "reasoning";
  if (/opus|ultra|pro-max/.test(s)) return "frontier";
  return "standard";
};

export const PLATFORMS: PlatformConfig[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    hostPattern: /chatgpt\.com|chat\.openai\.com/,
    assistantSelectors: [
      '[data-message-author-role="assistant"]',
      'div.markdown.prose',
    ],
    endpoints: [/\/backend-api\/f?\/?conversation/],
    extractPrompt: (b) => b?.messages?.at(-1)?.content?.parts?.join(" ") ?? "",
    extractModel: (b) => b?.model,
    classify: byName,
  },
  {
    id: "claude",
    label: "Claude",
    hostPattern: /claude\.ai/,
    assistantSelectors: ['[data-testid="conversation-turn"]', ".font-claude-response"],
    endpoints: [/\/chat_conversations\/[^/]+\/completion/],
    extractPrompt: (b) => b?.prompt ?? "",
    extractModel: (b) => b?.model,
    classify: byName,
  },
  {
    id: "gemini",
    label: "Gemini",
    hostPattern: /gemini\.google\.com/,
    // Gemini's transport is batchexecute — ugly. DOM only.
    assistantSelectors: ["model-response", "message-content"],
    classify: () => "standard",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    hostPattern: /perplexity\.ai/,
    assistantSelectors: ['[class*="prose"]'],
    classify: () => "standard",
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    hostPattern: /github\.com\/copilot/,
    assistantSelectors: ['[data-testid="chat-message"]'],
    classify: () => "standard",
  },
];
```

> **Selectors drift.** Every one of these will need verifying. Budget 20 minutes the morning of the demo to open each site, inspect, and confirm. Build the fallback chain (`assistantSelectors` is an *array*, try each in order) and add a last-resort generic mode: observe any added subtree whose text grows past 200 chars. That generic fallback is your insurance policy — with it, a broken selector degrades to slightly-less-accurate rather than nothing-happens-on-stage.

### 5.4 The DOM collector (the part that must work)

```ts
// src/content/collector.ts — sketch
const cfg = PLATFORMS.find((p) => p.hostPattern.test(location.host));
if (cfg) {
  let active: { el: Element; t0: number; last: number; timer?: number } | null = null;

  new MutationObserver(() => {
    const nodes = cfg.assistantSelectors
      .map((s) => Array.from(document.querySelectorAll(s)).at(-1))
      .find(Boolean);
    if (!nodes) return;

    const now = performance.now();
    if (!active || active.el !== nodes) active = { el: nodes, t0: now, last: now };
    active.last = now;

    clearTimeout(active.timer);
    active.timer = window.setTimeout(() => finalize(active!), 1200) as unknown as number;
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  function finalize(a: NonNullable<typeof active>) {
    const text = a.el.textContent ?? "";
    if (text.length < 20) return;
    chrome.runtime.sendMessage({
      type: "inference",
      platform: cfg!.id,
      ts: Date.now(),
      outputChars: text.length,
      streamMs: a.last - a.t0,
      ...pendingFromInterceptor(),   // model hint + prompt, if MAIN world caught it
    });
    active = null;
  }
}
```

### 5.5 Storage schema

Keep it flat — service worker restarts constantly, so read-modify-write on every event.

```ts
type DayKey = string;              // "2026-08-15"
interface Store {
  events: Record<DayKey, InferenceEvent[]>;
  settings: { assumptionSet: "google2025" | "devries2023"; region: string; blockerOn: boolean };
  blocked: Record<DayKey, number>;
}
```

Rotate `events` to keep only the last 14 days. Prune on write.

### 5.6 Badge

```ts
chrome.action.setBadgeText({ text: `${Math.round(todayWh)}` });
chrome.action.setBadgeBackgroundColor({ color: "#166534" });
```

Watching that number tick up live while you use ChatGPT is worth more in the demo than any chart. Prioritise it.

### 5.7 Popup UI (PRIORITY 1)

Single screen, no navigation. Top to bottom:

1. **Today's total**, big — `12 Wh` with `(5 – 30 Wh)` beneath it in muted text.
2. Three stat cards: **Energy / Water / CO₂e**, each with its range.
3. **Equivalence line**: "≈ 1 phone charge, ≈ 2 sips of water".
4. **Per-platform bar** — small stacked bar, ChatGPT vs Claude vs Gemini.
5. **Savings card**: "You could have used 62% less energy today."
6. **Assumption toggle**: `Google 2025 ⇄ de Vries 2023` — numbers visibly jump ~10×.
7. Footer: `All values are estimates · Methodology →`

That footer line is non-negotiable and appears on every surface.

### 5.8 Insights (rules-based, no LLM)

```ts
const RULES = [
  { when: (d) => d.reasoningShare > 0.3,
    say: "Reasoning mode ran on 30%+ of your queries. It costs roughly 6× a standard reply — switch it off for lookups and short answers." },
  { when: (d) => d.avgOutputTokens < 150 && d.frontierShare > 0.5,
    say: "Most of your replies were short but ran on a large model. A smaller model would cut ~85% of the energy with no quality loss for these." },
  { when: (d) => d.blockedOverviews > 5,
    say: `You avoided ${d.blockedOverviews} AI Overviews — about ${(d.blockedOverviews * 0.3).toFixed(1)} Wh of generation you never asked for.` },
];
```

Sixty lines, deterministic, offline, and it says the same things an LLM would.

---

## 6. The AI Overview blocker — answering your question

**Yes, it's blockable client-side, and better than "hide it with CSS."** There are three tiers:

**Tier 1 — cosmetic (don't ship alone).** Inject CSS hiding the AI Overview container. The summary was already generated server-side, so you saved zero energy. This is greenwashing. If you ship it at all, label it "hidden, not prevented."

**Tier 2 — actual prevention via `udm=14`. ← ship this.** Google's "Web" results filter is a real, documented Google feature, and it's addressable by the URL parameter `udm=14`. A search with `udm=14` returns classic link results and normally no AI Overview — meaning the summary is **never generated**. Real prevention, not cosmetic.

Redirect *before* the request leaves the browser using `declarativeNetRequest`:

```json
[
  {
    "id": 1, "priority": 2,
    "action": { "type": "allow" },
    "condition": { "urlFilter": "udm=14", "resourceTypes": ["main_frame"], "requestDomains": ["google.com"] }
  },
  {
    "id": 2, "priority": 1,
    "action": {
      "type": "redirect",
      "redirect": { "transform": { "queryTransform": { "addOrReplaceParams": [{ "key": "udm", "value": "14" }] } } }
    },
    "condition": { "urlFilter": "||google.com/search", "resourceTypes": ["main_frame"] }
  }
]
```

Rule 1 is the loop-breaker: DNR gives `allow` precedence over `redirect` at higher priority, so once `udm=14` is present the redirect stops firing. Without it you get a redirect loop and an error page. This is the single detail most likely to cost you an hour — it's handled above.

Toggle at runtime with `chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["ruleset"] })` so the popup switch works live on stage.

**Caveats to state honestly** (and *state them* — a judge who knows this and hears you gloss over it will discount everything else you said):
- `udm=14` is undocumented as a parameter. Google documents the Web filter itself but makes no promise about the parameter, and its behaviour can vary by region, query type, and sign-in state. It has worked continuously since May 2024, but verify it the morning of the demo.
- It only covers `google.com/search`. Google's AI Mode is a separate surface.
- Fallback if it ever breaks: append `-AI` to the query, which abuses the exclusion operator. Imperfect (it also filters genuine pages about AI) but a working stopgap.

**Tier 3 — count what you prevented.** Every redirect fires a counter. `blockedCount × 0.3 Wh` becomes an "avoided" number in the popup. Cheap, and it's the only positive-feeling metric in the whole product — everything else is a number going up.

---

## 7. Build order and hour budget

Assumes ~30 hours. Ship in this order and you have a demo at every checkpoint.

| Phase | Hours | Deliverable | Checkpoint |
|---|---|---|---|
| **0 · Scaffold** | 2 | Vite + CRXJS + Tailwind, loads unpacked, popup renders "hello" | Extension in toolbar |
| **1 · Detection** | 4 | Collector + registry, ChatGPT only, logs to console | `console.log` shows char count after a real ChatGPT reply |
| **2 · Model** | 3 | `constants.ts` + `estimator.ts` with unit tests on known anchors | 500-token standard query → 0.3 Wh ±10% |
| **3 · Store + badge** | 2 | Service worker persists events, badge shows today's Wh | **Badge ticks up live. This is your demo core — you are now safe.** |
| **4 · Popup** | 5 | Full popup per §5.7, ranges, equivalences | Screenshot-ready |
| **5 · Platforms 2–3** | 3 | Claude + Gemini via registry | Cross-platform bar populates |
| **6 · Blocker** | 2 | DNR ruleset + toggle + avoided counter | Search google, no AI Overview, counter +1 |
| **7 · Methodology page** | 2 | Every coefficient + citation + assumption toggle | Toggle moves numbers 10× |
| **8 · Savings + insights** | 2 | Counterfactuals + rules engine | "62% less" card |
| **9 · Demo hardening** | 3 | Seed data, demo mode, rehearse ×3 | Under 3:00 on the clock |
| **10 · Dashboard** *(stretch)* | 3 | Full-page view, recharts sparkline, 7-day trend | Only if 9 is done |

**Do not start phase 10 until phase 9 is finished.** A rehearsed 3-minute demo of phases 0–9 beats an unrehearsed demo with a trend graph.

### Parallelisation for 3 people
- **A:** phases 1 + 5 (detection, the riskiest work — give it your strongest debugger)
- **B:** phases 2 + 7 + 8 (model + methodology — mostly pure functions, no browser needed, testable in isolation)
- **C:** phases 0 + 3 + 4 (scaffold, storage, UI)

B's work has no dependency on A's, which is what makes this parallelise cleanly. Agree the `InferenceEvent` interface in hour one and don't change it.

---

## 8. Demo script (2:55)

| Time | Beat |
|---|---|
| **0:00–0:20** | Hook. *"Two and a half billion AI queries a day. Nobody can tell you what one costs — published estimates disagree by a factor of ten. We built the tool that shows you the range."* |
| **0:20–0:35** | Install: `chrome://extensions` → Load unpacked → icon appears, badge reads `0`. |
| **0:35–1:20** | Use it live. Pre-written prompt into ChatGPT that generates a long answer. **Badge ticks up.** Second prompt with reasoning mode on — badge jumps hard. Switch to Claude, one query. Switch to Gemini, one query. |
| **1:20–2:00** | Open popup. Today's total with its range. Three stat cards. Equivalences. Per-platform bar with all three. Point at the reasoning query: *"this single query cost about fifty normal ones."* |
| **2:00–2:20** | Flip the assumption toggle. **Numbers move 10×.** *"Same usage, different published methodology. This is why we show ranges — and why we ship our sources."* One-second flash of the methodology page. |
| **2:20–2:40** | Blocker on. Google something. No AI Overview. Avoided counter increments. *"That summary was never generated — we redirect to Google's own Web filter before the request leaves your browser."* |
| **2:40–2:55** | Savings card, then drag the scale slider to 1M users. Close: *"Individually it's a kettle boil. That's exactly why nobody counts it. Now you can."* |

**Preparation:**
- Prompts written out in a scratch file, ready to paste. Choose prompts that reliably generate 600+ words so the numbers visibly move.
- Logged into all three services beforehand, on the demo profile.
- Extension folder open on the desktop, ready to drag.
- Rehearse three times with a timer. Every hackathon demo runs 40% longer than you think.

---

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Selector breaks on demo day | **High** | Fallback selector chain + generic "any growing text node" mode. Verify all three platforms the morning of. |
| Venue wifi dies / rate limit hit | Medium | **Ship a demo mode.** A hidden button that replays 40 seeded events over 30 seconds. Build this in phase 9 — it is the difference between a failed demo and a fine one. |
| Service worker eats state | Medium | Never store state in SW module scope. Everything through `chrome.storage`. |
| `fetch` patch breaks ChatGPT | Low | Request-body-only, never touches the response. Kill switch in options. |
| `udm=14` stops working | Low | Verify morning-of. Fallback to `-AI` operator or CSS hiding (relabelled "hidden, not prevented"). |
| Judge challenges the numbers | **Certain** | This is the good outcome. Methodology page, visible ranges, assumption toggle. Answer: *"we don't claim to know — we claim to show you what the published research spans, and we cite all of it."* |

---

## 10. Sources to cite on the methodology page

| Coefficient | Source |
|---|---|
| ~0.3 Wh per GPT-4o text query | Epoch AI (2025) |
| 0.34 Wh, 0.32 mL water per query | OpenAI, Altman blog post (June 2025) — note: no supporting evidence published |
| 0.24 Wh median Gemini text prompt; comprehensive accounting ≈2.4× naive | Google technical report (Aug 2025) |
| ~3 Wh per query (superseded, kept as the alternate assumption set) | de Vries (2023); EPRI / BestBrokers (2024) |
| Per-inference energy by task type; image generation ~2.9 Wh | Luccioni, Jernite & Strubell, *Power Hungry Processing* (2024) |
| Reasoning-model queries ~18 Wh avg, up to ~40 Wh | Univ. of Rhode Island estimate (2025) — wide uncertainty |
| Datacenter water use, WUE | Li et al., *Making AI Less Thirsty* (2023) |
| US grid carbon intensity 369 gCO₂e/kWh | EPA eGRID |
| World average 475 gCO₂e/kWh | IEA |
| On the misuse and misquotation of these figures | *Misinformation by Omission: The Need for More Environmental Transparency in AI*, arXiv:2506.15572 |

Cite that last one prominently. A sustainability project that names the failure mode of sustainability projects — and then avoids it — is a much stronger pitch than one more counter.

---

## 11. Deliberately not building

Say this on stage if asked "what's next" — a crisp cut list reads as judgement, not as a gap.

- Backend, accounts, sync
- LLM-powered recommendations *(a rules engine does the same job without the energy cost — which is on-theme)*
- Training-cost amortisation per query
- Live grid intensity API *(static table; ElectricityMaps is a one-fetch upgrade)*
- Firefox / Safari builds
- Web Store publication
