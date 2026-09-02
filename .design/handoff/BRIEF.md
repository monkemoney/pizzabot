# Landing page — design handoff brief

**Send `landing-standalone.html` together with this file.** The HTML renders on
its own: open it in any browser, no server, no build step. It pulls two fonts
from Google Fonts and nothing else. Anything that comes
back must still open the same way.

---

## What it is

The public landing page for **Jasell** — an AI ordering assistant that runs on a
restaurant's own phone number. It is the first thing a visitor sees at
jasell.com, before signing in.

**Audience:** owners of independent restaurants in Los Angeles. Busy, sceptical,
already paying a marketplace 15–30% and unhappy about it. Not consumers, not
enterprise buyers.

**Job:** make an owner understand in ten seconds that they can take orders
without a person on the phone and without a commission — then get in touch.

**Tone:** plain and confident. Not playful, not startup-cute, not corporate.
The product handles somebody's money and somebody's dinner rush.

---

## Four things that must not change

These are load-bearing. Breaking one of them breaks the page in a way that is
not visible in a screenshot.

**1. `data-t="…"` attributes are the translation hooks.**
The page ships in English, Spanish and Hebrew. `applyLang()` swaps every
element carrying `data-t` against the `COPY` map at the bottom of the file.
Delete one attribute and that string silently stops translating. If you add a
new text element, give it a `data-t` key and add that key to all three
languages in `COPY`.

**2. The percentages are cited facts, not decoration.**
15–30%, 15–27% and 30–40% are published 2026 marketplace rates, with sources
linked in the footer. Do not round them, invent better ones, or drop the
citations. If a number is inconvenient for a layout, change the layout.

**3. `dir="rtl"` must keep working.**
Hebrew flips the whole page. Use logical CSS properties throughout —
`inset-inline-start`, `margin-inline`, `padding-inline`, `text-align: start` —
never `left` / `right`. Test by clicking עב in the header.
One deliberate exception: the logo and the copyright line are pinned
`dir="ltr"` because a brand name must not mirror. Keep that.

**4. Every animation is gated on `prefers-reduced-motion`.**
The reveal-on-scroll, the stat count-up and the bar fills all collapse to their
end state when the user asks for reduced motion. Keep the gate on anything new.

Also keep: the brand colours (`--color-brand: #5e17eb`, `--color-accent:
#ff66c4`), the `/login` link, and the `#contact` mailto CTA.

---

## What I would like improved

Be specific with the designer — "make it look better" produces generic SaaS.
These are the actual weaknesses:

**Hero composition.** The headline, sub and CTAs are all left-aligned in a
single column, and the right half of the viewport is empty gradient. It needs
either a visual on the right (a phone showing a WhatsApp order thread would be
honest to the product) or a composition that earns the whitespace.

**The commission chart.** Each bar's width equals its percentage, which is
truthful but reads as sparse — the longest bar fills 40% of its track. Find a
treatment that keeps the proportion honest while making the contrast between
30–40% and 0% hit harder.

**Typographic scale.** Sizes were picked ad hoc with `clamp()`. A real scale
with consistent ratios, and a rhythm between section padding, heading margins
and body leading.

**The stat row.** Four tiles of equal weight, so nothing leads. "0% commission"
is the one that should stop someone.

**The feature cards.** Generic bordered rectangles with Lucide-style icons.
They carry the actual product explanation and deserve more than a default card.

**Do not** rewrite the copy, restructure the sections, or add testimonials,
logos, or statistics. There is no live customer to source social proof from,
and inventing it is not on the table.

---

## Prompt to paste, if you are using ChatGPT or similar

> This is a landing page for a restaurant ordering product, aimed at
> independent restaurant owners in Los Angeles. It renders standalone — open it
> in a browser to see it.
>
> Redesign the visual layer only. Improve the typographic scale and spacing
> rhythm, the hero composition (the right half is currently empty), the
> commission bar chart, the stat row hierarchy, and the feature cards.
>
> Hard constraints, all of which I will check:
> - Keep every `data-t` attribute exactly as it is — they drive an EN/ES/HE
>   language selector. If you add text, add a `data-t` key and its three
>   translations to the `COPY` map.
> - Do not change any percentage or remove the source links. They are cited.
> - Keep `dir="rtl"` working: use logical CSS properties only, never left/right.
>   The logo and copyright stay `dir="ltr"`.
> - Keep every animation gated behind `prefers-reduced-motion`.
> - Keep the brand colours and the file self-contained — one HTML file, no
>   build step. The only external reference is the Google Fonts link for
>   Poppins and Heebo; that one may stay, and Heebo is what makes Hebrew
>   legible, so do not drop it.
>
> Do not rewrite the copy or add testimonials, customer logos or statistics.
>
> Return the complete file.

---

## Checking what comes back

Open the returned file in a browser and run these five. Any failure means it
goes back.

1. **It opens standalone** — no missing styles, no console errors, no request
   to a CDN or a local path.
2. **All three languages switch** — click EN, ES and עב in the header. Every
   visible string changes. Nothing falls back to English mid-page.
3. **Hebrew is genuinely RTL** — the nav mirrors, text aligns right, and the
   logo still reads `Jasell.` and not `.Jasell`.
4. **The numbers are untouched** — 15–30%, 15–27%, 30–40%, 0%, and three
   source links in the footer.
5. **Reduced motion is honoured** — enable it in your OS accessibility settings,
   reload, and confirm nothing animates and nothing is stuck invisible.

A quick way to check 2 and 4 without clicking: search the returned file for
`data-t=` (41 occurrences in the version I am sending) and for `15–30%`.

---

## When it comes back

Hand the file to me and I will diff it against the current one, re-run those
checks, and merge it into `public/landing.html` — the live file has a pre-paint
session redirect and a `<link>` to `tokens.css` that the standalone copy does
not, and those need to survive the merge.
