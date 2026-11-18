/*!
 * squadquest-rsvp.js: a dependency-free RSVP embed for SquadQuest guest links.
 *
 *   <div data-squadquest-rsvp>…shown when there is no link…</div>
 *   <script src="squadquest-rsvp.js"
 *           data-api="https://<supabase host>/functions/v1/guest-rsvp" defer></script>
 *
 * Reads ?t=<guest token> or ?o=<open-link token> from the page URL, talks to
 * the guest-rsvp endpoint, and renders into every [data-squadquest-rsvp]
 * element (one event's card where the element has data-event="<id>",
 * otherwise all of the guest's events). See README.md for the attributes,
 * the endpoint contract, the classes and the events it emits.
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    document.querySelector("script[data-api][src*='squadquest-rsvp']");
  if (!script) return;

  var API = script.getAttribute("data-api") || "";
  // Only needed when the server checks a JWT on every function call.
  var ANON_KEY = script.getAttribute("data-anon-key") || "";
  var ZONE = script.getAttribute("data-timezone") || undefined;
  var P = "sqr-"; // the one class prefix
  var STORE = "squadquest-rsvp:";
  var EVENT_NAME = "squadquest:rsvp";

  var ANSWERS = [
    { value: "yes", label: "I'm in", saved: "You're in" },
    { value: "maybe", label: "Maybe", saved: "You're a maybe" },
    { value: "no", label: "Can't make it", saved: "You can't make it" },
  ];

  var DEFAULT_CSS =
    "." + P + "root{font:inherit;color:inherit;display:grid;gap:1rem}" +
    "." + P + "card{border:1px solid rgba(0,0,0,.15);border-radius:12px;padding:1rem;background:rgba(255,255,255,.6)}" +
    "." + P + "banner{display:block;width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin-bottom:.75rem}" +
    "." + P + "title{margin:0 0 .25rem;font-size:1.2rem}" +
    "." + P + "when,." + P + "where{margin:.15rem 0;opacity:.85}" +
    "." + P + "notes{white-space:pre-line;margin:.5rem 0}" +
    "." + P + "canceled{font-weight:700;color:#b00020}" +
    "." + P + "answers{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:.75rem}" +
    "." + P + "answer{font:inherit;font-size:1.05rem;padding:.9rem .4rem;min-height:3.25rem;border-radius:10px;border:2px solid currentColor;background:transparent;color:inherit;cursor:pointer}" +
    "." + P + "answer[aria-pressed=true]{background:#1f6f43;border-color:#1f6f43;color:#fff}" +
    "." + P + "answer:disabled{opacity:.55;cursor:default}" +
    "." + P + "status{min-height:1.4em;margin:.5rem 0 0;font-weight:600}" +
    "." + P + "error{color:#b00020}" +
    "." + P + "field{display:grid;gap:.25rem;margin:.5rem 0}" +
    "." + P + "field input{font:inherit;font-size:1.1rem;padding:.7rem;border-radius:8px;border:1px solid rgba(0,0,0,.3)}" +
    "." + P + "greeting{margin:0;font-size:1.1rem}" +
    "." + P + "join{margin:0;font-size:.95rem;opacity:.85}" +
    "." + P + "link{background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit}" +
    "." + P + "step{display:grid;gap:.5rem;margin-top:.75rem;padding:.9rem;border-radius:10px;border:2px solid currentColor}" +
    "." + P + "step-intro{margin:0;font-weight:600}" +
    "." + P + "field-error{margin:0;color:#b00020;font-weight:600}" +
    "." + P + "step-actions{display:flex;gap:1rem;align-items:center;flex-wrap:wrap}" +
    "." + P + "submit{font:inherit;font-weight:700;padding:.8rem 1.2rem;min-height:3rem;border-radius:10px;border:2px solid currentColor;background:#1f6f43;color:#fff;cursor:pointer}" +
    "." + P + "field input[aria-invalid=true]{border-color:#b00020}" +
    "." + P + "note{margin-top:.5rem}" +
    "." + P + "note-text{margin:0;overflow-wrap:anywhere}" +
    "." + P + "note-label{font-weight:600}" +
    "." + P + "note-count{margin:0;font-size:.85rem;opacity:.8;text-align:right}" +
    "." + P + "note-status{margin:.35rem 0 0;font-size:.95rem}" +
    "." + P + "note-form{display:grid;gap:.5rem}" +
    "." + P + "plus{display:grid;gap:.4rem;margin-top:.6rem}" +
    "." + P + "plus-row{display:flex;align-items:center;gap:.5rem}" +
    "." + P + "plus-q{margin:0;font-weight:600}" +
    "." + P + "plus-btn{flex:none;font:inherit;font-size:1.3rem;font-weight:700;width:44px;height:44px;border-radius:50%;border:2px solid currentColor;background:transparent;color:inherit;cursor:pointer}" +
    "." + P + "plus-btn:disabled{opacity:.4;cursor:default}" +
    "." + P + "plus-val{min-width:7.5rem;text-align:center;font-weight:700}" +
    "." + P + "plus-msg{margin:0;font-size:.9rem}";

  // ── helpers ────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls.split(" ").map(function (c) { return P + c; }).join(" ");
    if (text != null) node.textContent = text; // never innerHTML: all text is data
    return node;
  }

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(STORE + key);
      if (value === null) window.localStorage.removeItem(STORE + key);
      else window.localStorage.setItem(STORE + key, value);
    } catch (e) { /* storage blocked: the page still works, it just forgets */ }
    return null;
  }

  function formatWhen(ev) {
    if (!ev.start) return "";
    var opts = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: ZONE };
    var timeOnly = { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: ZONE };
    try {
      var start = new Date(ev.start);
      var text = start.toLocaleString(undefined, opts);
      var until = ev.start_max && ev.start_max !== ev.start ? new Date(ev.start_max) : null;
      if (until) text += " to " + until.toLocaleTimeString(undefined, timeOnly);
      else text = start.toLocaleString(undefined, Object.assign({ timeZoneName: "short" }, opts));
      if (ev.end) text += " · ends " + new Date(ev.end).toLocaleTimeString(undefined, timeOnly);
      return text;
    } catch (e) {
      return ev.start;
    }
  }

  function answerFor(value) {
    for (var i = 0; i < ANSWERS.length; i++) if (ANSWERS[i].value === value) return ANSWERS[i];
    return null;
  }

  function request(method, query, body) {
    var headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (ANON_KEY) {
      headers.apikey = ANON_KEY;
      headers.Authorization = "Bearer " + ANON_KEY;
    }
    return fetch(API + (query || ""), {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      referrerPolicy: "no-referrer",
    }).then(
      function (res) {
        return res.json().then(
          function (data) { return { status: res.status, data: data }; },
          function () { return { status: res.status, data: {} }; }
        );
      },
      function () { return { status: 0, data: { error: "network" } }; }
    );
  }

  function errorText(status, code, mode) {
    if (status === 0) return "Couldn't reach the server. Check your connection and try again.";
    if (code === "not_found") {
      return mode === "open"
        ? "This RSVP link isn't open any more. Text the host to let them know."
        : "This link isn't working. Text the host for a new one.";
    }
    if (code === "claimed") return "You're on SquadQuest now. Answer in the app.";
    if (code === "bad_request") {
      return mode === "open" ? "Check your phone number and first name." : "That didn't work. Try again.";
    }
    return "Something went wrong. Try again in a minute.";
  }

  function emit(slot, detail) {
    slot.dispatchEvent(new CustomEvent(EVENT_NAME, { bubbles: true, detail: detail }));
  }

  // ── rendering ─────────────────────────────────────────────────────

  function eventCard(ev) {
    var card = el("article", "card");
    card.setAttribute("data-event-id", ev.id);
    if (ev.banner && /^https:\/\//.test(ev.banner)) {
      var img = el("img", "banner");
      img.src = ev.banner;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      card.appendChild(img);
    }
    card.appendChild(el("h3", "title", ev.title || "Untitled event"));
    if (ev.event_status === "canceled") card.appendChild(el("p", "canceled", "This event is canceled."));
    var when = formatWhen(ev);
    if (when) card.appendChild(el("p", "when", when));
    if (ev.location) card.appendChild(el("p", "where", ev.location));
    if (ev.notes) card.appendChild(el("p", "notes", ev.notes));
    return card;
  }

  function answerRow(current, disabled, onPick) {
    var row = el("div", "answers");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Your answer");
    ANSWERS.forEach(function (a) {
      var b = el("button", "answer answer-" + a.value, a.label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(current === a.value));
      b.disabled = !!disabled;
      b.addEventListener("click", function () { onPick(a.value, row); });
      row.appendChild(b);
    });
    return row;
  }

  function setBusy(row, busy) {
    Array.prototype.forEach.call(row.querySelectorAll("button"), function (b) { b.disabled = busy; });
  }

  // Shown once a guest has said yes or maybe: the way from guest to member.
  // data-join="none" on the script tag turns it off.
  function joinLine() {
    if (script.getAttribute("data-join") === "none") return null;
    var p = el("p", "join", "Want to see who else is coming? ");
    var a = el("a", "link", "Get SquadQuest");
    a.href = "https://squadquest.app";
    a.target = "_blank";
    a.rel = "noopener";
    p.appendChild(a);
    p.appendChild(document.createTextNode(" and sign up with this phone number."));
    return p;
  }
  function wantsIn(value) { return value === "yes" || value === "maybe"; }

  function savedLine(value) {
    var a = answerFor(value);
    return a ? "Saved: " + a.saved + "." : "";
  }

  // Guest mode: ?t=<token>. One card per event, each with its own control.
  function renderGuest(slots, token, payload) {
    slots.forEach(function (slot) {
      var only = slot.getAttribute("data-event");
      var events = payload.events.filter(function (e) { return !only || e.id === only; });
      var root = el("div", "root " + "mode-guest");
      if (!only && payload.guest) {
        var host = payload.host && payload.host.first_name;
        root.appendChild(el("p", "greeting", "Hi " + payload.guest.name + "!" + (host ? " " + host + " invited you." : "")));
      }
      if (events.length === 0) {
        root.appendChild(el("p", "status", only ? "" : "There's nothing to answer right now."));
      }
      events.forEach(function (ev) {
        var card = eventCard(ev);
        var status = el("p", "status", ev.rsvp && ev.rsvp !== "invited" ? savedLine(ev.rsvp) : "");
        status.setAttribute("aria-live", "polite");
        if (payload.claimed) {
          status.textContent = "";
        } else if (ev.event_status !== "canceled") {
          card.appendChild(answerRow(ev.rsvp, false, function (value, row) {
            setBusy(row, true);
            status.className = P + "status";
            status.textContent = "Saving…";
            request("POST", "", { t: token, instance: ev.id, status: value }).then(function (res) {
              if (res.status === 200 && res.data && Array.isArray(res.data.events)) {
                renderGuest(slots, token, res.data);
                var saved = res.data.events.filter(function (e) { return e.id === ev.id; })[0];
                emit(slot, { mode: "guest", event: ev.id, rsvp: saved ? saved.rsvp : value, created: false });
              } else {
                setBusy(row, false);
                status.className = P + "status " + P + "error";
                status.textContent = errorText(res.status, res.data && res.data.error, "guest");
              }
            });
          }));
        }
        card.appendChild(status);
        root.appendChild(card);
      });
      if (!only && payload.claimed) {
        var moved = el("p", "join", "You're on SquadQuest now. ");
        var app = el("a", "link", "Answer in the app");
        app.href = "https://squadquest.app";
        app.target = "_blank";
        app.rel = "noopener";
        moved.appendChild(app);
        moved.appendChild(document.createTextNode("."));
        root.appendChild(moved);
      }
      if (!only && events.some(function (e) { return wantsIn(e.rsvp); })) {
        var join = joinLine();
        if (join) root.appendChild(join);
      }
      slot.replaceChildren(root);
    });
  }

  // Open mode: ?o=<token>. One screen: phone, first name, three buttons.
  function renderOpen(slots, openToken, payload, saved, problem) {
    var ev = payload.events[0];
    slots.forEach(function (slot) {
      var only = slot.getAttribute("data-event");
      if (only && only !== ev.id) return;
      var root = el("div", "root " + "mode-open");
      var card = eventCard(ev);

      var status = el("p", problem ? "status error" : "status", problem || (saved ? savedLine(saved) : ""));
      status.setAttribute("aria-live", "polite");

      var phoneId = "sqr-phone-" + Math.random().toString(36).slice(2);
      var nameId = "sqr-name-" + Math.random().toString(36).slice(2);
      var phoneField = el("div", "field");
      var phoneLabel = el("label", null, "Your phone number");
      phoneLabel.htmlFor = phoneId;
      var phone = el("input");
      phone.id = phoneId;
      phone.type = "tel";
      phone.inputMode = "tel";
      phone.autocomplete = "tel";
      phone.required = true;
      phone.maxLength = 32;
      phone.value = store("phone") || "";
      phoneField.appendChild(phoneLabel);
      phoneField.appendChild(phone);

      var nameField = el("div", "field");
      var nameLabel = el("label", null, "Your first name");
      nameLabel.htmlFor = nameId;
      var name = el("input");
      name.id = nameId;
      name.type = "text";
      name.autocomplete = "given-name";
      name.required = true;
      name.maxLength = 80;
      name.value = store("name") || "";
      nameField.appendChild(nameLabel);
      nameField.appendChild(name);

      var remembered = !!(phone.value && name.value);
      if (remembered) {
        // one tap: show who we think you are, with a way out
        var who = el("p", "greeting", "Answering as " + name.value + " at " + phone.value + ". ");
        var notMe = el("button", "link", "Not you?");
        notMe.type = "button";
        notMe.addEventListener("click", function () {
          store("phone", null);
          store("name", null);
          renderOpen(slots, openToken, payload, null);
        });
        who.appendChild(notMe);
        card.appendChild(who);
      } else {
        card.appendChild(phoneField);
        card.appendChild(nameField);
      }

      card.appendChild(answerRow(saved, false, function (value, row) {
        var p = phone.value.trim();
        var n = name.value.trim();
        if (!p || !n) {
          status.className = P + "status " + P + "error";
          status.textContent = !p ? "Add your phone number first." : "Add your first name first.";
          (!p ? phone : name).focus();
          return;
        }
        setBusy(row, true);
        status.className = P + "status";
        status.textContent = "Saving…";
        request("POST", "", { o: openToken, phone: p, name: n, status: value }).then(function (res) {
          if (res.status === 200 && res.data && Array.isArray(res.data.events)) {
            store("phone", p);
            store("name", n);
            emit(slot, { mode: "open", event: ev.id, rsvp: value, created: !!res.data.created });
            if (res.data.token) {
              // a new guest: switch to their own link so they can change it later
              store("token", res.data.token);
              var url = new URL(window.location.href);
              url.searchParams.delete("o");
              url.searchParams.set("t", res.data.token);
              window.history.replaceState(null, "", url.toString());
              start();
            } else {
              renderOpen(slots, openToken, payload, value);
            }
          } else {
            var message = errorText(res.status, res.data && res.data.error, "open");
            if (res.data && res.data.error === "bad_request" && remembered) {
              // remembered details were rejected: show the fields again
              store("phone", null);
              store("name", null);
              renderOpen(slots, openToken, payload, null, message);
              return;
            }
            setBusy(row, false);
            status.className = P + "status " + P + "error";
            status.textContent = message;
          }
        });
      }));
      card.appendChild(status);
      root.appendChild(card);
      if (!problem && wantsIn(saved)) {
        var join = joinLine();
        if (join) root.appendChild(join);
      }
      slot.replaceChildren(root);
    });
  }

  function renderError(slots, message) {
    slots.forEach(function (slot) {
      var root = el("div", "root " + "mode-error");
      root.appendChild(el("p", "status " + "error", message));
      slot.replaceChildren(root);
    });
  }

  function injectStyles() {
    if (script.getAttribute("data-styles") === "none" || document.getElementById("sqr-default-styles")) return;
    var style = document.createElement("style");
    style.id = "sqr-default-styles";
    style.textContent = DEFAULT_CSS;
    // first in <head>, so any host stylesheet wins without !important
    document.head.insertBefore(style, document.head.firstChild);
  }

  // ── flyer mode: slots with data-open="<open token>" ─────────────────
  // One page, one open link per event, three buttons per event. The first
  // tap asks for a first name and phone once; every later tap is one tap.
  // The identity (token, phone, name) lives in localStorage, never in the
  // address. A flyer slot shows buttons only, never event details, so no
  // event outside the page's own slots can appear.

  var flyer = null;
  var CLAIMED_TEXT = "You're on SquadQuest now. Answer in the app.";

  function localAnswers() {
    try { return JSON.parse(store("answers") || "{}") || {}; } catch (e) { return {}; }
  }
  // answers and notes on this device, by event id: {rsvp, note}
  function localEntry(id) {
    var v = id ? localAnswers()[id] : null;
    if (typeof v === "string") return { rsvp: v, note: null }; // older shape
    return v || {};
  }
  function saveLocal(id, patch) {
    if (!id) return;
    var a = localAnswers();
    var cur = localEntry(id);
    Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
    a[id] = cur;
    store("answers", JSON.stringify(a));
  }
  function saveLocalAnswer(id, value) { saveLocal(id, { rsvp: value }); }
  function forgetIdentity() {
    ["token", "phone", "name", "answers"].forEach(function (k) { store(k, null); });
  }
  // the same rule the function applies: E.164, or a US number of 10 digits
  // (11 starting with 1) with spaces, dots, dashes or parentheses
  function validPhone(p) {
    var d = p.replace(/[\s().-]/g, "");
    return /^\+\d{7,15}$/.test(d) || /^1?\d{10}$/.test(d);
  }
  function guestEvent(id) {
    if (!flyer.guest || !id) return null;
    return flyer.guest.events.filter(function (e) { return e.id === id; })[0] || null;
  }
  function currentAnswer(s) {
    if (flyer.claimed) return null;
    var g = guestEvent(s.eventId);
    if (g && answerFor(g.rsvp)) return g.rsvp;
    return localEntry(s.eventId).rsvp || null;
  }
  // the server's note wins whenever the guest payload has this event
  // plus-ones: the server's number wins whenever the guest payload has this event
  function currentPlus(s) {
    if (flyer.claimed) return 0;
    var g = guestEvent(s.eventId);
    if (g && typeof g.plus === "number") return g.plus;
    return localEntry(s.eventId).plus || 0;
  }
  function currentNote(s) {
    if (flyer.claimed) return null;
    var g = guestEvent(s.eventId);
    if (g && g.note !== undefined) return g.note || null;
    return localEntry(s.eventId).note || null;
  }
  function hostName() {
    return (flyer.guest && flyer.guest.host && flyer.guest.host.first_name) || flyer.host || null;
  }
  function identityName() {
    return (flyer.guest && flyer.guest.guest && flyer.guest.guest.name) || store("name") || null;
  }

  function notifyIdentity() {
    var known = !!(store("token") || (store("phone") && store("name")));
    document.dispatchEvent(new CustomEvent("squadquest:identity", {
      detail: { name: known ? identityName() : null, claimed: flyer.claimed },
    }));
  }

  function renderFlyer() {
    flyer.slots.forEach(function (s) {
      var root = el("div", "root mode-flyer");
      var pending = flyer.pending && flyer.pending.slot === s ? flyer.pending : null;
      var cur = currentAnswer(s);
      if (!s.dead) {
        root.appendChild(answerRow(pending ? pending.value : cur, flyer.claimed || s.busy, function (value) {
          tap(s, value);
        }));
      }
      if (pending) root.appendChild(joinStep(s, pending));
      var text = s.msg != null ? s.msg : flyer.claimed ? CLAIMED_TEXT : cur ? savedLine(cur) : "";
      // sqr-status-saved: the line is only the saved answer, so a page that
      // shows its own confirmation (from squadquest:answer) can hide it
      var isSaved = s.msg == null && !flyer.claimed && !!cur;
      var status = el("p", s.err ? "status error" : isSaved ? "status status-saved" : "status", text);
      status.setAttribute("aria-live", "polite");
      root.appendChild(status);
      if (wantsIn(cur) && !pending && !s.dead && !flyer.claimed) root.appendChild(plusArea(s));
      if (cur && !pending && !s.dead && !flyer.claimed) root.appendChild(noteArea(s));
      if (!flyer.claimed && s.showJoin && wantsIn(cur)) {
        var join = joinLine();
        if (join) root.appendChild(join);
      }
      s.el.replaceChildren(root);
    });
  }

  function setMsg(s, msg, isError) { s.msg = msg; s.err = !!isError; }

  // the slot's answer as it now stands, for a page's own confirmation:
  // cause is "load", "answer" (a tap saved), "plus" (a number saved) or "reset"
  function announce(s, cause) {
    s.el.dispatchEvent(new CustomEvent("squadquest:answer", {
      bubbles: true,
      detail: { event: s.eventId, rsvp: currentAnswer(s), plus: currentPlus(s), cause: cause },
    }));
  }

  function joinStep(s, pending) {
    var form = el("form", "step");
    form.noValidate = true;
    var a = answerFor(pending.value);
    form.appendChild(el("p", "step-intro", "First time? Tell us who's answering. You'll only do this once."));
    var made = function (label, type, auto, value) {
      var id = "sqr-" + auto + "-" + Math.random().toString(36).slice(2);
      var f = el("div", "field");
      var l = el("label", null, label);
      l.htmlFor = id;
      var i = el("input");
      i.id = id;
      i.type = type;
      i.autocomplete = auto;
      i.required = true;
      i.value = value || "";
      f.appendChild(l);
      f.appendChild(i);
      form.appendChild(f);
      return i;
    };
    var name = made("First name", "text", "given-name", pending.name != null ? pending.name : store("name"));
    name.addEventListener("input", function () { pending.name = name.value; });
    name.maxLength = 80;
    var phone = made("Phone number", "tel", "tel", pending.phone != null ? pending.phone : store("phone"));
    phone.addEventListener("input", function () { pending.phone = phone.value; });
    if (wantsIn(pending.value)) {
      form.appendChild(stepper(pending.plus || 0, function (n) { pending.plus = n; }).node);
    }
    phone.inputMode = "tel";
    phone.maxLength = 32;
    var noteLabel = "Note for " + (hostName() || "the host") + " (optional)";
    var noteIn = noteInput(form, noteLabel, pending.note != null ? pending.note : "", function (v) { pending.note = v; });
    noteIn.required = false;
    var err = el("p", "field-error", pending.error || "");
    err.id = "sqr-err-" + Math.random().toString(36).slice(2);
    err.setAttribute("aria-live", "assertive");
    form.appendChild(err);
    var actions = el("div", "step-actions");
    var submit = el("button", "submit", "Send: " + a.label);
    submit.type = "submit";
    submit.disabled = !!s.busy;
    var cancel = el("button", "link", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", function () { flyer.pending = null; renderFlyer(); });
    actions.appendChild(submit);
    actions.appendChild(cancel);
    form.appendChild(actions);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      pending.name = name.value;
      pending.phone = phone.value;
      pending.note = noteIn.value;
      var n = name.value.trim();
      var p = phone.value.trim();
      name.removeAttribute("aria-invalid");
      phone.removeAttribute("aria-invalid");
      var bad = !n ? [name, "Add your first name."] :
        !validPhone(p) ? [phone, "That phone number doesn't look right. Use 10 digits, or + and the country code."] : null;
      if (bad) {
        bad[0].setAttribute("aria-invalid", "true");
        bad[0].setAttribute("aria-describedby", err.id);
        err.textContent = pending.error = bad[1];
        bad[0].focus();
        return;
      }
      pending.error = "";
      var note = noteIn.value.trim();
      var plus = wantsIn(pending.value) && pending.plus ? pending.plus : undefined;
      openPost(s, pending.value, p, n, true, note ? note : undefined, plus);
    });
    return form;
  }

  // ── notes: optional, saved apart from the one-tap answer ─────────────
  var NOTE_MAX = 200;

  function noteInput(form, label, value, onInput) {
    var id = "sqr-note-" + Math.random().toString(36).slice(2);
    var f = el("div", "field");
    var l = el("label", null, label);
    l.htmlFor = id;
    var i = el("input");
    i.id = id;
    i.type = "text";
    i.maxLength = NOTE_MAX;
    i.autocomplete = "off";
    i.value = value || "";
    var count = el("p", "note-count");
    count.id = id + "-count";
    var show = function () { count.textContent = i.value.length + " / " + NOTE_MAX; };
    show();
    i.setAttribute("aria-describedby", count.id);
    i.addEventListener("input", function () { show(); if (onInput) onInput(i.value); });
    f.appendChild(l);
    f.appendChild(i);
    f.appendChild(count);
    form.appendChild(f);
    return i;
  }

  function noteArea(s) {
    var box = el("div", "note");
    var note = currentNote(s);
    var host = hostName() || "the host";
    if (s.noteOpen) {
      var form = el("form", "note-form");
      form.noValidate = true;
      var input = noteInput(form, "Note for " + host, s.noteDraft != null ? s.noteDraft : note || "", function (v) {
        s.noteDraft = v;
      });
      var actions = el("div", "step-actions");
      var save = el("button", "submit", "Save note");
      save.type = "submit";
      save.disabled = !!s.noteBusy;
      var cancel = el("button", "link", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", function () {
        s.noteOpen = false;
        s.noteDraft = null;
        s.noteMsg = null;
        renderFlyer();
        focusIn(s, ".sqr-note button");
      });
      actions.appendChild(save);
      actions.appendChild(cancel);
      form.appendChild(actions);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        saveNote(s, input.value);
      });
      box.appendChild(form);
    } else if (note) {
      var p = el("p", "note-text");
      p.appendChild(el("span", "note-label", "Your note: "));
      p.appendChild(document.createTextNode(note)); // text only, never HTML
      p.appendChild(document.createTextNode(" "));
      var edit = el("button", "link", "Edit");
      edit.type = "button";
      edit.setAttribute("aria-label", "Edit your note");
      edit.addEventListener("click", function () { openNote(s); });
      p.appendChild(edit);
      box.appendChild(p);
    } else {
      var add = el("button", "link note-add", "Add a note for " + host);
      add.type = "button";
      add.addEventListener("click", function () { openNote(s); });
      box.appendChild(add);
    }
    if (s.noteMsg) {
      var m = el("p", s.noteErr ? "note-status error" : "note-status", s.noteMsg);
      m.setAttribute("aria-live", "polite");
      box.appendChild(m);
    }
    return box;
  }

  function focusIn(s, selector) {
    var target = s.el.querySelector(selector);
    if (target) target.focus();
  }

  function openNote(s) {
    s.noteOpen = true;
    s.noteDraft = null;
    s.noteMsg = null;
    renderFlyer();
    focusIn(s, ".sqr-note input");
  }

  // a note rides on the night's current answer: post the same status with it
  function saveNote(s, text) {
    var status = currentAnswer(s);
    if (!status) return;
    var note = text.trim();
    if (note.length > NOTE_MAX) {
      s.noteMsg = "Notes can be up to " + NOTE_MAX + " characters.";
      s.noteErr = true;
      return renderFlyer();
    }
    var token = store("token");
    var body = token && guestEvent(s.eventId)
      ? { t: token, instance: s.eventId, status: status, note: note }
      : { o: s.open, phone: store("phone"), name: store("name"), status: status, note: note };
    s.noteDraft = text;
    s.noteBusy = true;
    s.noteMsg = "Saving note…";
    s.noteErr = false;
    renderFlyer();
    request("POST", "", body).then(function (res) {
      s.noteBusy = false;
      var code = res.data && res.data.error;
      if (res.status === 200 && res.data && Array.isArray(res.data.events)) {
        if (body.t) {
          flyer.guest = res.data;
          flyer.claimed = !!res.data.claimed;
        }
        var ev = res.data.events.filter(function (e) { return e.id === s.eventId; })[0];
        var saved = ev && ev.note !== undefined ? ev.note : note || null;
        saveLocal(s.eventId, { note: saved });
        if (res.data.token) store("token", res.data.token);
        s.noteOpen = false;
        s.noteDraft = null;
        s.noteMsg = saved ? "Note saved." : "Note removed.";
        renderFlyer();
        focusIn(s, ".sqr-note button");
        return;
      }
      if (code === "claimed") {
        flyer.claimed = true;
        s.noteOpen = false;
        s.noteMsg = null;
      } else {
        s.noteMsg = code === "bad_request"
          ? "Note not saved. Notes can be up to " + NOTE_MAX + " characters."
          : "Note not saved. " + errorText(res.status, code, body.t ? "guest" : "open");
        s.noteErr = true;
      }
      renderFlyer();
    });
  }

  // ── plus-ones: a stepper, saved on its own after a short pause ─────────
  var PLUS_MAX = 9;
  var PLUS_WAIT = 600;
  var ROOM_TEXT = "That's more than the list has room for.";

  function plusText(n) { return n > 0 ? "+" + n + " with you" : "Just me"; }

  // a self-contained stepper that updates in place, so focus stays put
  function stepper(value, onChange) {
    var box = el("div", "plus");
    box.setAttribute("role", "group");
    var q = el("p", "plus-q", "Bringing anyone?");
    q.id = "sqr-plus-" + Math.random().toString(36).slice(2);
    box.setAttribute("aria-labelledby", q.id);
    var minus = el("button", "plus-btn plus-minus", "−");
    minus.type = "button";
    minus.setAttribute("aria-label", "One fewer guest");
    var out = el("span", "plus-val");
    out.setAttribute("aria-live", "polite");
    var more = el("button", "plus-btn plus-more", "+");
    more.type = "button";
    more.setAttribute("aria-label", "One more guest");
    var msg = el("p", "plus-msg");
    msg.setAttribute("aria-live", "polite");
    var n = value;
    function show() {
      out.textContent = plusText(n);
      minus.disabled = n <= 0;
      more.disabled = n >= PLUS_MAX;
    }
    function step(d) {
      var next = Math.max(0, Math.min(PLUS_MAX, n + d));
      if (next === n) return;
      n = next;
      show();
      onChange(n);
    }
    minus.addEventListener("click", function () { step(-1); });
    more.addEventListener("click", function () { step(1); });
    var row = el("div", "plus-row");
    row.appendChild(minus);
    row.appendChild(out);
    row.appendChild(more);
    box.appendChild(q);
    box.appendChild(row);
    box.appendChild(msg);
    show();
    return {
      node: box,
      set: function (v) { n = v; show(); },
      say: function (text, isError) { msg.textContent = text || ""; msg.className = P + "plus-msg" + (isError ? " " + P + "error" : ""); },
    };
  }

  function plusArea(s) {
    var shown = s.plusShown != null ? s.plusShown : currentPlus(s);
    var st = stepper(shown, function (n) {
      s.plusShown = n;
      s.plusMsg = null;
      st.say("");
      clearTimeout(s.plusTimer);
      s.plusTimer = setTimeout(function () { savePlus(s); }, PLUS_WAIT);
    });
    s.plusUI = st;
    if (s.plusMsg) st.say(s.plusMsg, s.plusErr);
    return st.node;
  }

  // the number rides on the night's current answer: post the same status with it
  function savePlus(s) {
    var status = currentAnswer(s);
    var value = s.plusShown;
    if (value == null || !wantsIn(status)) { s.plusShown = null; return; }
    var token = store("token");
    var viaToken = !!(token && guestEvent(s.eventId));
    var body = viaToken
      ? { t: token, instance: s.eventId, status: status, plus: value }
      : { o: s.open, phone: store("phone"), name: store("name"), status: status, plus: value };
    var ui = function (text, isError) {
      s.plusMsg = text;
      s.plusErr = !!isError;
      if (s.plusUI) s.plusUI.say(text, isError);
    };
    ui("Saving…");
    request("POST", "", body).then(function (res) {
      var code = res.data && res.data.error;
      var stale = s.plusShown !== value; // changed again while this was in flight
      if (res.status === 200 && res.data && Array.isArray(res.data.events)) {
        if (viaToken) {
          flyer.guest = res.data;
          flyer.claimed = !!res.data.claimed;
        }
        var ev = res.data.events.filter(function (e) { return e.id === s.eventId; })[0];
        saveLocal(s.eventId, { plus: ev && typeof ev.plus === "number" ? ev.plus : value });
        if (!stale) { s.plusShown = null; ui("Saved"); }
        announce(s, "plus");
        return;
      }
      if (stale) return;
      if (code === "claimed") { flyer.claimed = true; s.plusShown = null; renderFlyer(); return; }
      var back = currentPlus(s);
      s.plusShown = null;
      if (s.plusUI) s.plusUI.set(back);
      ui(!viaToken && code === "not_found" ? ROOM_TEXT + " Back to " + plusText(back).toLowerCase() + "." :
        "Not saved. Back to " + plusText(back).toLowerCase() + ".", true);
    });
  }

  function tap(s, value) {
    if (flyer.claimed) return;
    if (flyer.pending && flyer.pending.slot === s) { flyer.pending.value = value; renderFlyer(); return; }
    var token = store("token");
    s.noteMsg = null;
    if (token && guestEvent(s.eventId)) return guestPost(s, value, token);
    var phone = store("phone");
    var name = store("name");
    if (phone && name) return openPost(s, value, phone, name, false);
    flyer.pending = { slot: s, value: value };
    setMsg(s, null);
    renderFlyer();
    var first = s.el.querySelector("input");
    if (first) first.focus();
  }

  function saving(s) { s.busy = true; setMsg(s, "Saving…"); renderFlyer(); }

  function guestPost(s, value, token) {
    saving(s);
    request("POST", "", { t: token, instance: s.eventId, status: value }).then(function (res) {
      s.busy = false;
      var saved = false;
      if (res.status === 200 && res.data && Array.isArray(res.data.events)) {
        flyer.guest = res.data;
        flyer.claimed = !!res.data.claimed;
        saveLocalAnswer(s.eventId, value);
        setMsg(s, null);
        s.showJoin = true;
        emit(s.el, { mode: "guest", event: s.eventId, rsvp: value, created: false });
        saved = true;
      } else if (res.data && res.data.error === "claimed") {
        flyer.claimed = true;
        setMsg(s, null);
      } else if (res.status === 404) {
        // the stored token is dead: start fresh and ask again
        forgetIdentity();
        flyer.guest = null;
        flyer.pending = { slot: s, value: value };
        setMsg(s, null);
      } else {
        setMsg(s, "Not saved. " + errorText(res.status, res.data && res.data.error, "guest"), true);
      }
      renderFlyer();
      notifyIdentity();
      if (saved) announce(s, "answer");
    });
  }

  // note: undefined leaves any saved note alone (the key is not sent)
  // plus: likewise, undefined leaves the saved number alone
  function openPost(s, value, phone, name, fromStep, note, plus) {
    if (!s.open) { setMsg(s, "This RSVP isn't open any more. Text the host.", true); renderFlyer(); return; }
    saving(s);
    var body = { o: s.open, phone: phone, name: name, status: value };
    if (note !== undefined) body.note = note;
    if (plus !== undefined) body.plus = plus;
    request("POST", "", body).then(function (res) {
      s.busy = false;
      var code = res.data && res.data.error;
      var saved = false;
      if (res.status === 200 && res.data && Array.isArray(res.data.events)) {
        store("phone", phone);
        store("name", name);
        flyer.pending = null;
        var ev = res.data.events[0];
        if (ev && !s.eventId) s.eventId = ev.id;
        saveLocalAnswer(s.eventId, value);
        if (note !== undefined) saveLocal(s.eventId, { note: ev && ev.note !== undefined ? ev.note : note || null });
        if (plus !== undefined) saveLocal(s.eventId, { plus: ev && typeof ev.plus === "number" ? ev.plus : plus });
        setMsg(s, null);
        s.showJoin = true;
        emit(s.el, { mode: "open", event: s.eventId, rsvp: value, created: !!res.data.created });
        if (res.data.token) {
          store("token", res.data.token);
          return loadGuest().then(function () { renderFlyer(); notifyIdentity(); announce(s, "answer"); });
        }
        saved = true;
      } else if (code === "claimed") {
        flyer.pending = null;
        flyer.claimed = true;
        setMsg(s, null);
      } else if (code === "bad_request") {
        // phone or name rejected: show the step again with the message
        if (!fromStep) { store("phone", null); }
        flyer.pending = { slot: s, value: value, name: name, phone: phone, note: note, plus: plus,
          error: note && note.length > NOTE_MAX ? "Notes can be up to " + NOTE_MAX + " characters." :
            "Check your phone number and first name." };
        setMsg(s, null);
      } else if (fromStep && plus && code === "not_found") {
        // an open link at its cap answers 404: say so and keep the step open
        flyer.pending = { slot: s, value: value, name: name, phone: phone, note: note, plus: plus,
          error: ROOM_TEXT };
        setMsg(s, null);
      } else {
        setMsg(s, "Not saved. " + errorText(res.status, code, "open"), true);
        if (fromStep) flyer.pending = { slot: s, value: value, name: name, phone: phone, note: note, plus: plus };
      }
      renderFlyer();
      notifyIdentity();
      if (saved) announce(s, "answer");
    });
  }

  function loadGuest() {
    var t = store("token");
    if (!t) { flyer.guest = null; return Promise.resolve(); }
    return request("GET", "?t=" + encodeURIComponent(t)).then(function (res) {
      if (res.status === 200 && res.data && Array.isArray(res.data.events)) {
        flyer.guest = res.data;
        flyer.claimed = !!res.data.claimed;
        flyer.loadError = false;
        if (!store("name") && res.data.guest) store("name", res.data.guest.name);
      } else if (res.status === 404) {
        forgetIdentity(); // a dead token: back to the fresh state
        flyer.guest = null;
        flyer.claimed = false;
      } else {
        flyer.loadError = true; // keep the token; answers still save
      }
    });
  }

  function startFlyer(els) {
    var url = new URL(window.location.href);
    var t = url.searchParams.get("t");
    if (t) {
      // a ?t= link wins: store it, and take it out of the address so a
      // shared address never carries it
      if (store("token") !== t) forgetIdentity();
      store("token", t);
      url.searchParams.delete("t");
      window.history.replaceState(null, "", url.toString());
    }
    flyer = {
      slots: els.map(function (e) {
        return { el: e, open: e.getAttribute("data-open"), eventId: e.getAttribute("data-event") || null };
      }),
      guest: null, claimed: false, pending: null, loadError: false,
    };
    injectStyles();
    var jobs = [loadGuest()];
    flyer.slots.forEach(function (s) {
      jobs.push(request("GET", "?o=" + encodeURIComponent(s.open)).then(function (res) {
        var ok = res.status === 200 && res.data && Array.isArray(res.data.events) && res.data.events.length;
        if (ok) s.eventId = s.eventId || res.data.events[0].id;
        if (ok && res.data.host) flyer.host = res.data.host.first_name;
        else s.openError = errorText(res.status, res.data && res.data.error, "open");
      }));
    });
    return Promise.all(jobs).then(function () {
      flyer.slots.forEach(function (s) {
        if (s.openError && !guestEvent(s.eventId)) { s.dead = true; setMsg(s, s.openError, true); }
        else if (flyer.loadError) setMsg(s, "Couldn't load your answers. Tapping still saves.", true);
      });
      renderFlyer();
      notifyIdentity();
      flyer.slots.forEach(function (s) { announce(s, "load"); });
      document.dispatchEvent(new CustomEvent("squadquest:rsvp-ready", {
        detail: { mode: flyer.guest ? "guest" : "open", data: flyer.guest },
      }));
    });
  }

  // "Not you?": forget who is answering on this device and reset the buttons
  window.SquadQuestRSVP = {
    forget: function () {
      forgetIdentity();
      if (!flyer) return;
      flyer.guest = null;
      flyer.claimed = false;
      flyer.pending = null;
      flyer.slots.forEach(function (s) {
        s.showJoin = false;
        s.noteOpen = false;
        s.noteDraft = null;
        s.noteMsg = null;
        clearTimeout(s.plusTimer);
        s.plusShown = null;
        s.plusMsg = null;
        if (!s.dead) setMsg(s, null);
      });
      renderFlyer();
      notifyIdentity();
      flyer.slots.forEach(function (s) { announce(s, "reset"); });
    },
  };

  function start() {
    var slots = Array.prototype.slice.call(document.querySelectorAll("[data-squadquest-rsvp]"));
    if (slots.length === 0 || !API) return;
    var flyerSlots = slots.filter(function (s) { return !!s.getAttribute("data-open"); });
    if (flyerSlots.length) {
      startFlyer(flyerSlots);
      slots = slots.filter(function (s) { return !s.getAttribute("data-open"); });
      if (slots.length === 0) return;
    }
    var params = new URLSearchParams(window.location.search);
    var t = params.get("t");
    var o = params.get("o");

    if (!t && !o) {
      // no link: leave the host page's own content in each slot
      document.dispatchEvent(new CustomEvent("squadquest:rsvp-ready", { detail: { mode: "none" } }));
      return;
    }
    injectStyles();
    var mode = t ? "guest" : "open";
    var query = t ? "?t=" + encodeURIComponent(t) : "?o=" + encodeURIComponent(o);
    request("GET", query).then(function (res) {
      if (res.status !== 200 || !res.data || !Array.isArray(res.data.events)) {
        renderError(slots, errorText(res.status, res.data && res.data.error, mode));
        return;
      }
      if (t) renderGuest(slots, t, res.data);
      else renderOpen(slots, o, res.data, null);
      document.dispatchEvent(new CustomEvent("squadquest:rsvp-ready", { detail: { mode: mode, data: res.data } }));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
