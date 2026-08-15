# LMPrint

A Chrome extension that estimates the energy, water and carbon footprint of your
AI chatbot usage, and shows you how little anyone actually agrees on those
numbers.

Published per-query estimates span more than an order of magnitude, from about
0.24 Wh to about 3 Wh for the same class of query, depending on whose
methodology you use. LMPrint shows every figure as a range, cites every
coefficient, and lets you switch between the two published assumption sets and
watch the numbers move by roughly ten times.

## Running it

```sh
pnpm install
pnpm build
```

Then in Chrome: open `chrome://extensions`, turn on Developer mode, choose "Load
unpacked" and pick the `dist` folder. The LMPrint icon appears in the toolbar
with a badge showing today's watt-hours.

For development with hot reload on the popup and the pages:

```sh
pnpm dev
```

Other commands:

| Command          | What it does                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| `pnpm test`      | Unit tests for the model, the collector, storage and the blocker             |
| `pnpm typecheck` | `tsc` over the whole source tree                                             |
| `pnpm verify`    | Loads `dist/` in Chromium and screenshots every surface into `ignored/shots` |
| `pnpm simulate`  | Replays inference events into the running extension and prints the badge     |
| `pnpm icons`     | Regenerates the icon PNGs                                                    |

## How it works

```
AI page
  |- interceptor.ts (MAIN world)     sees fetch(), reads the request body only
  |        | window.postMessage      model name and prompt token count
  |        v
  |- collector.ts (ISOLATED world)   MutationObserver on the response
  |        |                         counts characters, times the stream
  |        | chrome.runtime.sendMessage
  |        v
service-worker.ts                    estimator.ts -> chrome.storage.local
         |                                        -> badge text
         | chrome.storage.onChanged
         v
    popup / dashboard / methodology
```

Detection is DOM-primary and network-enhanced. The MutationObserver path is the
one that must work, and it only reads the page. The `fetch` patch is an
enhancement that reads the request body for the model name, and returns the
original `Response` object untouched, so a failure there costs accuracy rather
than the page you are sitting on.

There is no backend. `chrome.storage.local` is the database, history is pruned
to fourteen days, and nothing leaves the machine.

### Privacy

Prompt text is never stored and never crosses a process boundary. The
interceptor counts tokens in the page and posts only the number. Whether a query
was trivial is judged by how little came back, not by reading what was asked.

## The estimate

```
tokens + stream duration -> IT energy -> x PUE -> carbon and water
```

Two estimators are blended. The token-based one is weighted at 0.8 for normal
replies, where the tokens are visible and worth trusting. Reasoning replies flip
to 0.7 on the time-based one, because you cannot see a reasoning model's hidden
thinking tokens but you can see how long it thought.

A standard 500-token reply comes out at 0.32 Wh at the meter and 0.72 mL of
water, against published anchors of about 0.3 Wh and a stated 0.32 mL. Ours is
higher on water because the published figure is almost certainly onsite
evaporation only.

Every coefficient, its source, and the choices worth arguing with are on the
methodology page, which is one click from the popup.

## Adding a platform

`src/platforms/registry.ts` is the configurable list. A new entry needs a host
pattern, an ordered list of selectors for the assistant's response, and a
function that maps a model name to a class. Endpoints and body extractors are
optional, and only buy the model name.

Selectors drift without warning, so `assistantSelectors` is tried in order and
there is a last-resort generic mode that watches any subtree whose text grows
past 200 characters. A broken selector degrades to slightly less accurate rather
than to nothing happening.

## Demo notes

- Double-click the LMPrint wordmark in the popup to load a seeded fortnight.
  Useful when the wifi is gone or an account is rate limited.
- `pnpm simulate` does the same thing through the real accounting path, and
  prints the badge after each event.
- The blocker ships disabled so it can be switched on live. It redirects
  `google.com/search` to Google's own Web filter with `udm=14`, so the AI
  Overview is never generated rather than merely hidden.
- `udm=14` is undocumented as a parameter. It has worked since May 2024 but
  verify it on the morning of any demo. If it breaks, appending `-AI` to the
  query is a working stopgap.
