# Chris turns 40

A two-night birthday flyer that collects RSVPs through SquadQuest guest links, with no build step. `index.html` is the live page; `preview.html` is the same page running against a fake server in `shared/preview-stub.js`, so you can click through every state without a backend.

The RSVP widget is `squadquest-rsvp.js`. Its reference follows.

---

## Cache busting

`index.html` and `preview.html` link the stylesheet and scripts with a `?v=` stamp, a short
hash of each file's content. GitHub Pages lets browsers keep files for 10 minutes, so without
the stamp a visitor can get a new page with an old stylesheet. Run `tools/stamp-assets.sh`
before committing a change to `style.css` or any script. The `asset stamps` workflow fails
when a stamp is stale.

# SquadQuest RSVP embed (pilot)

`squadquest-rsvp.js` lets any static page collect yes / maybe / no answers from guests
who have no SquadQuest account. It has no dependencies and no build step. `index.html`
is an example host page that uses it; every detail still to be decided is marked `TK`.

## Use it

```html
<meta name="referrer" content="no-referrer">

<section data-squadquest-rsvp>
  <!-- shown when the page has no link; replaced when it does -->
  <p>To RSVP, text the host.</p>
</section>

<script src="squadquest-rsvp.js"
        data-api="https://supabase.squadquest.app/functions/v1/guest-rsvp"
        defer></script>
```

Open the page as `page.html?t=<guest token>` (a guest's private link, from
`squadquest-axi guests links --base-url <page url>`) or `page.html?o=<open token>` (an
event's open link, from `squadquest-axi guests open-link`, e.g. behind a QR code).
Without either, the embed does nothing and the slot keeps the page's own content.

### Script attributes

| Attribute | Required | Meaning |
| --- | --- | --- |
| `data-api` | yes | the `guest-rsvp` endpoint URL |
| `data-anon-key` | no | public anon key, sent as `apikey` and `Authorization: Bearer`. Needed only if the server checks a JWT on every function call (`FUNCTIONS_VERIFY_JWT=true`) |
| `data-timezone` | no | IANA zone for times, e.g. `America/New_York`. Default: the viewer's own zone |
| `data-styles="none"` | no | skip the default styles |
| `data-join="none"` | no | hide the "Get SquadQuest" line shown after a yes or maybe |

The script also works when added from code (`document.createElement("script")`), as
`index.html` does.

### Slots

Every element with `data-squadquest-rsvp` is a slot.

- No `data-event`: all of the guest's events, each as a card with its own answer
  buttons, and a greeting.
- `data-event="<event id>"`: only that event's card, so a page can put each event's
  control in its own section.

### What a guest sees

- **`?t=`**: "Hi <name>! <host> invited you.", then a card per event (title, time,
  place, notes, banner) with three buttons: **I'm in**, **Maybe**, **Can't make it**.
  A tap saves at once and the card shows "Saved: …". Canceled events say so and have no
  buttons.
- **`?o=`**: one screen for the one event: phone number, first name, and the same three
  buttons, which submit at once. Phone and first name are remembered on the device, so
  the next event's QR code needs one tap ("Answering as Robin at …", with "Not you?").
  - A **new** phone number becomes a new guest: the page stores their own token and
    switches the address to `?t=<token>`, so they can come back and change the answer.
  - A phone number **already on the host's list** is answered for that person, but the
    page gets no token and no name back. It shows the saved answer and lets them change
    it from the same open link.

### Styling

All classes start with `sqr-`: `sqr-root`, `sqr-mode-guest` / `sqr-mode-open` /
`sqr-mode-error`, `sqr-card`, `sqr-banner`, `sqr-title`, `sqr-when`, `sqr-where`,
`sqr-notes`, `sqr-canceled`, `sqr-answers`, `sqr-answer`, `sqr-answer-yes|maybe|no`,
`sqr-status`, `sqr-error`, `sqr-field`, `sqr-greeting`, `sqr-link`. The selected button has
`aria-pressed="true"`. Default styles are injected first in `<head>`, so any page
stylesheet overrides them without `!important`.

### DOM events

| Event | On | `detail` |
| --- | --- | --- |
| `squadquest:rsvp` | the slot (bubbles) | `{mode: "guest" \| "open", event: <id>, rsvp: "yes" \| "maybe" \| "no", created: <bool>}`, after each saved answer |
| `squadquest:rsvp-ready` | `document` | `{mode: "none" \| "guest" \| "open", data?}`, once the first load finishes |
| `squadquest:answer` | a flyer slot (bubbles) | `{event: <id>, rsvp: "yes" \| "maybe" \| "no" \| null, plus: <n>, cause: "load" \| "answer" \| "plus" \| "reset"}`: the slot's answer as it stands, after the first load, each saved answer, each saved plus-one count and "Not you?" |

In flyer mode the status line carries `sqr-status-saved` while it only repeats the saved
answer, so a page with its own confirmation can hide it.

### Stored on the device

`localStorage` keys `squadquest-rsvp:phone`, `squadquest-rsvp:name` (open-link one-tap)
and `squadquest-rsvp:token` (a token created through an open link).

## Endpoint contract

`<data-api>`: CORS open for `GET, POST, OPTIONS`; JSON; `Cache-Control: no-store`.

| Request | 200 response |
| --- | --- |
| `GET ?t=<token>` | `{guest:{name}, host:{first_name}, events:[Event]}` |
| `POST {t, instance, status}` | same as `GET ?t`, after the write |
| `GET ?o=<token>` | `{guest:null, host:{first_name}, events:[Event]}` (one event, `rsvp: null`) |
| `POST {o, phone, name, status}` | `{created, token, guest:null, host:{first_name}, events:[Event]}`: the one event with the answer just set. `token` is the new guest's token only when `created`; otherwise `null` |

`status` is `yes`, `maybe` or `no`. `phone` is E.164, or a US number as 10 digits (11
starting with 1) with any spaces, dots, dashes or parentheses. `name` is 1 to 80
characters.

`Event`: `{id, title, start, start_max, end, location, notes, banner, event_status,
rsvp}`. Times are ISO 8601 UTC; `start`–`start_max` is the arrival window; `end` may be
null. `event_status` is `live` or `canceled`. `rsvp` is `invited`, `yes`, `maybe`, `no`
(or `null` on an open link's GET).

Errors are always `{"error": "<code>"}`:

| HTTP | code | the embed shows |
| --- | --- | --- |
| 400 | `bad_request` | "Check your phone number and first name." (open) / "That didn't work." |
| 404 | `not_found` | "This link isn't working. Text the host for a new one." / "This RSVP link isn't open any more." |
| 405 | `method_not_allowed` | generic retry message |
| 413 | `too_large` | generic retry message |
| 500 | `server_error` | generic retry message |

An unknown token, an event the guest is not on, a canceled event and a closed or full
open link all give the same 404.

## Risks to know before sharing a page

- A private link is that guest's password. Anyone holding it can see their events and
  change their answer.
- An open link has no phone verification: anyone with the flyer can answer as any number,
  including someone already on the list. They never get that person's link, name or
  other events, and the host sees every answer with `squadquest-axi guests`.
- Nothing here sends a text message.

## Per-slot open links (`data-open`)

A slot with `data-open="<open token>"` carries its own open link, so one page can offer an
open RSVP for several events (`index.html` here does this).

- Without `?t=`: each such slot runs the open flow for its own token. A `?o=` in the address
  is left to slots without `data-open`.
- With `?t=` (or a token stored on this device by an earlier open-link answer): a slot whose
  event is on the guest's list shows that one event with the guest's buttons; otherwise it
  shows its open flow. Such a slot never renders any other event in the guest payload.
- A new guest created through a `data-open` slot is **not** moved to `?t=` in the address
  (people share a flyer page's address); the token stays in `localStorage` and the page
  switches to their answers. `squadquest:rsvp-ready` then carries `source: "stored"`.
- The join line and the claimed note show inside each `data-open` slot.

## Notes (flyer mode)

After a night is answered, a flyer slot offers "Add a note for <host>": one text field,
200 characters, live counter, Save. A saved note shows as text with Edit; saving it empty
removes it. The first-time step also has an optional note field, sent with the answer.

- A note save posts the night's current `status` plus `note`. A plain tap never sends `note`,
  so it leaves a saved note alone.
- Notes render with `textContent` only.
- Answers and notes are kept on the device in `squadquest-rsvp:answers` as
  `{<event id>: {rsvp, note}}`; when a token load returns the event, its `note` wins.

## Plus-ones (flyer mode)

After "I'm in" or "Maybe", a slot shows a "Bringing anyone?" stepper (0 to 9, 44px buttons,
the value announced politely). Each change saves about 600 ms after the last tap by posting
the night's current `status` with `plus`; a failure reverts to the saved number and says so.
An open-link 404 on such a save means the link is at its cap ("That's more than the list
has room for"). Answer taps and note saves never send `plus`. The first-time step has the
same stepper. The number is kept with the answer and note in `squadquest-rsvp:answers`;
a token load's `plus` wins.
