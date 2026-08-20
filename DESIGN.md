# Moor — design system

**Closer to a well-made bank than to a crypto app.** One asset, one chain, one accent. The
restraint isn't decoration; it's the product argument. A wallet that looks calm is easier to
trust with money than one that looks exciting.

Everything below is **implemented**, in [`app/src/theme.ts`](app/src/theme.ts) and the five
screens. Where it isn't, it says so. This page was aspirational for a while and drifted from
the code — the palette here and the palette in the app were different palettes — so the
values below were re-read out of the source rather than copied forward.

Derived with the `ui-ux-pro-max` skill (v2.5.0), then edited — its first recommendation was
gold-and-purple on slate, filed under "Gold trust + purple tech", which is precisely the
register we're avoiding. What survived is below, with reasons.

---

## Palette

From the skill's **Banking / Traditional Finance** set: *trust navy + premium gold*. Note
its own annotation — the accent was already adjusted from `#CA8A04` to `#A16207` to clear
WCAG 3:1. Values that arrive pre-checked are worth more than values that look nice.

### Light

| Token | Value | Use |
|---|---|---|
| `bg` | `#F8FAFC` | app background |
| `card` | `#FFFFFF` | surfaces |
| `line` | `#E2E8F0` | borders, dividers |
| `fg` | `#020617` | primary text, balance figures |
| `dim` | `#64748B` | secondary text, labels |
| `accent` | `#0F172A` | primary buttons, back links |
| `onAccent` | `#FFFFFF` | text on primary |
| `gold` | `#A16207` | the single highlight — sparingly |
| `danger` | `#DC2626` | destructive, errors |
| `warning` | `#8A5A00` | the dev-seed banner, the no-ETH notice |
| `onWarning` | `#FFFFFF` | text on warning |

### Dark

Designed, not inverted — the skill's `color-dark-mode` rule, and the reason most dark modes
feel muddy. Desaturated tonal variants, contrast re-checked independently.

| Token | Value | Use |
|---|---|---|
| `bg` | `#0B1220` | app background |
| `card` | `#151C2B` | surfaces |
| `line` | `#263041` | borders |
| `fg` | `#F8FAFC` | primary text |
| `dim` | `#94A3B8` | secondary text |
| `accent` | `#F8FAFC` | primary buttons invert |
| `onAccent` | `#0B1220` | text on primary |
| `gold` | `#D6A339` | lightened to hold 4.5:1 on dark |
| `danger` | `#F87171` | lightened likewise |
| `warning` | `#D79A3C` | lightened likewise |
| `onWarning` | `#0B1220` | text on warning |

**Where gold is allowed:** the amount on the send review screen, the amount and tick on the
sent screen, and the hairline rule under the launch wordmark. Nowhere else. An accent used
everywhere is not an accent.

**Why back links use `accent` rather than a link colour.** In a monochrome system the
interactive colour *is* near-black in light and near-white in dark. A separate link hue would
be a fourth colour earning its place on the argument that links should be blue, which is a
convention rather than a reason. Pressed feedback and a chevron carry the affordance instead.

**Three fixed values live outside the themes**, because they sit on something that isn't a
themed surface: `QR_LIGHT` / `QR_DARK` (many scanners will not read an inverted QR) and
`CAMERA_BG` / `CAMERA_FG` (chrome over a live camera feed). They are named in `theme.ts` so
the "no raw hex outside the theme file" rule still holds literally.

**Anti-patterns, from the skill, all apt:** playful design · unclear fees · AI purple/pink
gradients.

---

## Typography

**IBM Plex Sans** throughout — the skill's pick for "banks, finance, insurance, fintech",
and unusually well suited here: it was designed for interfaces, it ships real tabular
figures, and it renders identically on both platforms. The files are bundled with the app via
`@expo-google-fonts`, so this is a local read at launch rather than a download; `App.tsx`
holds the first frame until they land, because painting once in the system font is a visible
flash.

| Role | Size / weight | Notes |
|---|---|---|
| Balance | 46 / 700, `-1` tracking | **tabular figures** |
| Screen title | 30 / 700, `-0.5` |  |
| Send amount | 40 / 700 entry, 34 / 700 review | tabular; review is gold |
| Body | 15 / 400, line-height 22 | never below 15 |
| Label | 11 / 500, `+1.2` tracking, uppercase | card headers |
| Mono | address, peer key, tx hash, recovery phrase | IBM Plex Mono |

### A weight is a family

React Native does **not** synthesise weight for a custom font: `fontWeight: '700'` on a named
family is ignored on Android and faked on iOS. So `theme.ts` exports `sheet()`, which every
screen wraps its styles in — it maps `fontWeight` to the Plex family that actually carries
that weight and drops the now-meaningless property. Doing this by hand across five screens
means missing some, and a missed style is invisible on iOS: it just quietly renders in San
Francisco.

`fontWeight` should therefore never appear outside a `sheet()`-wrapped style map.

### Money typography

The one rule that isn't taste. **Use tabular figures for any number that changes.** A balance
in proportional figures reflows every time a digit updates — the decimal point walks left and
right while you're reading it. Tabular figures pin each glyph to the same width. It's the
difference between a number and a slot machine.

```ts
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] }
```

Applied to the balance, the requested amount, the send entry field, the review and sent
amounts, and every fee row.

The recovery phrase is **mono**, not sans. Those twelve words get transcribed by hand onto
paper, and a proportional face is where `rn` becomes `m`.

Also: group thousands, never truncate a balance, and keep "0" visually distinct from
"couldn't fetch" — a wallet that shows a confident zero when it simply failed to load is
lying about money. `Wallet.tsx` carries a separate `balance unavailable` line for exactly
this.

---

## Spacing & shape

4/8 rhythm. Section gaps `12 / 16 / 24 / 32`. Screen inset `20`.

Radius **`10` controls and inputs, `14` cards and surfaces, `18` hero**. Two deliberate
exceptions at `20`: the contact chip, which is a pill, and the camera reticle, which is a
viewfinder. Hairline borders over shadows — elevation belongs to sheets and modals, not to
every card.

Touch targets **≥44×44pt**, with `hitSlop` where a glyph is smaller. Every tappable surface
takes `PRESSED` — opacity `0.65`, so feedback is immediate and nothing shifts.

---

## The wordmark, and where it isn't

"Moor" used to sit at the top of the wallet screen permanently, and on three near-identical
boot screens. A logo on a screen whose job is a balance is just something in the way.

So the name gets **one** moment — an intro on launch, wordmark rising 8pt over 620ms with a
gold hairline drawing under it, then a 380ms fade into whatever comes next — and after that
it is gone from the app entirely. It is not a fake delay: the worklet is booting both stacks
and the keychain unlock is running behind it, which is time the app was spending anyway. A
1700ms floor holds it there — the first cut was 750ms and the name went by before you
could read it — and it also stops a fast boot turning the intro into a flicker.

`prefers-reduced-motion` skips the animation and cuts straight to the settled state. It is
the only animation in the app, so honouring it is one branch.

## Navigation

The wallet screen shows **money and nothing else**: incoming requests, the balance, Send, and
the receive QR. Everything else — Contacts, code exchange, your peer key, network and mirror
settings — is behind one icon in the top right.

That icon opens a plain screen, not a drawer. A hamburger conventionally promises a slide-out
panel, and building one for two destinations would be more machinery than there is
navigation. Back stacks stay one level deep.

## Appearance

Light, dark, or follow the phone — chosen in Menu, persisted to a small file in the app's
document directory. System is the default and is right for most people, but a wallet gets
opened in bed and in daylight, and the OS toggle is three taps away.

One consequence worth naming: the status bar has to follow the *app's* theme rather than the
phone's. `StatusBar style="auto"` reads the OS setting, which is dark text on a dark screen
the moment somebody overrides it.

## The moments that carry risk

Most of a wallet is a list and a number. The design work is in four screens where a mistake
is expensive.

**Showing the recovery phrase.** Numbered words in a mono grid, no screenshot-friendly
prettiness, and the plain sentence that everything depends on: *anyone who has these has your
money, and nobody can recover them for you.* No progress bar, no gamification. It shows the
phrase before the wallet exists rather than offering backup "later", which is where
unbacked-up wallets come from.

**Network mismatch on receive.** "Only send USD₮0 on Arbitrum to this address" sits under the
address permanently, not as a dismissible tooltip. Funds sent on the wrong chain are gone,
and the warning costs one line.

**Confirming a send.** The amount in gold, the recipient's *name* if they're a contact, the
fee stated in USD₮ — not in gas units, not in ETH. Someone spending twenty dollars should be
told what it costs in the currency they hold. The fee is quoted before the confirm button
appears.

**Deleting a contact.** Confirm, and say what it means: *this removes them from every device
you own.* Deletion propagates; the dialog should admit that.

---

## Empty states

Never a blank panel. Contacts with nothing in them explains the feature rather than
apologising: *"Anyone you add here appears on your other devices automatically — no account,
no server, no sync button."* An empty state is the one moment you have the user's full
attention and nothing competing for it.

---

## Icons

Lucide via `lucide-react-native`, stroke width 2, sizes `16 / 20 / 24` — plus `48` for the
single success mark. **No emoji and no typographic glyphs as UI.** A `‹` is not an icon: its
size and baseline move with the font and it cannot take a stroke width. Back navigation is
one shared [`BackLink`](app/src/BackLink.tsx) rather than four screens each drawing their own
character.

---

## Checklist

- [x] One palette, in `theme.ts`, matching this page
- [x] IBM Plex Sans and Mono bundled and loaded before first paint
- [x] Weight-to-family mapping, so custom-font weights actually render
- [x] Tabular figures on every number that changes
- [x] Mono on addresses, peer keys, hashes and the recovery phrase — on **both** platforms
- [x] Pressed feedback on every tappable surface, no layout shift
- [x] Radius on the 10/14/18 scale, exceptions named
- [x] No emoji or glyph icons; no raw hex outside `theme.ts`
- [x] Safe areas respected on every screen
- [x] Light / dark / system, chosen by the user and persisted
- [ ] Contrast re-verified on device in both themes (values are pre-checked, not re-measured here)
- [ ] All touch targets audited at ≥44pt — `BackLink` and buttons are, chips and inline links are not
- [ ] Dynamic Type at largest size doesn't truncate the balance
- [x] `prefers-reduced-motion` respected
- [ ] Tested at 375pt width and in landscape

**Running on a phone.** Both themes, the Plex faces, the tabular balance, the navy accent and
the icon set are all in the screenshots at the top of [`README.md`](README.md). The unticked
boxes above are the ones that need measurement rather than a look: contrast numbers, a touch
-target audit, Dynamic Type at its largest setting, and landscape.
