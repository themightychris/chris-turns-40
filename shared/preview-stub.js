/*
 * preview-stub.js: a fake guest-rsvp endpoint, so a concept works with no
 * backend. Loaded only by preview.html, right after the config block. Its
 * data lives in sessionStorage, so reloads keep answers like the real thing.
 *
 *   preview.html?reset=1        fresh visitor: clears the fake data and this device's identity
 *   preview.html?t=demo-two     guest link for Robin (on both nights)
 *   preview.html?t=demo-one     guest link for Sam (on Saturday only)
 *   preview.html?t=demo-answered guest who answered both nights, with a note on Friday
 *   preview.html?t=demo-claimed guest who joined SquadQuest
 *   preview.html?t=demo-dead    a token that 404s
 *   preview.html?fail=1         every save fails with a 500
 *   preview.html?failplus=1     only saves that carry plus fail with a 500
 *
 * The open links are capped: an open-link save asking for plus of 5 or more
 * answers 404, the way a full open link does.
 *
 * Phones in the one-time step: 215 555 0199 is a claimed member (409);
 * 215 555 0111 is Robin, already on the list; any other valid number is new.
 * Robin's payload also carries a third event that must never appear.
 */
(function () {
  "use strict";
  var C = window.FLYER_CONFIG;
  C.API_BASE = "https://mock.invalid/guest-rsvp";
  C.FRIDAY_OPEN_LINK = "open-fri";
  C.SATURDAY_OPEN_LINK = "open-sat";
  C.FRIDAY_EVENT_ID = "";
  C.SATURDAY_EVENT_ID = "";

  var params = new URLSearchParams(location.search);
  var KEY = "preview-stub-db";
  if (params.get("reset")) {
    sessionStorage.removeItem(KEY);
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("squadquest-rsvp:") === 0) localStorage.removeItem(k); }); } catch (e) { /* ok */ }
    params.delete("reset");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : ""));
  }
  var failAll = params.get("fail") === "1";
  var failPlus = params.get("failplus") === "1";
  var OPEN_CAP_PLUS = 5;

  function seed() {
    return {
      n: 0,
      guests: {
        "demo-two": { name: "Robin", phone: "+12155550111", answers: { "ev-fri": "invited", "ev-sat": "invited", "ev-other": "invited" } },
        "demo-one": { name: "Sam", phone: "+12155550122", answers: { "ev-sat": "invited", "ev-other": "invited" } },
        "demo-answered": { name: "Alex", phone: "+12155550133", answers: { "ev-fri": "yes", "ev-sat": "maybe" },
          notes: { "ev-fri": "Bringing my sister, she loves this band." } },
        "demo-claimed": { name: "Jo", phone: "+12155550199", claimed: true, answers: { "ev-fri": "invited", "ev-sat": "invited" } },
      },
    };
  }
  var db = JSON.parse(sessionStorage.getItem(KEY) || "null") || seed();
  function save() { sessionStorage.setItem(KEY, JSON.stringify(db)); }
  var opens = { "open-fri": "ev-fri", "open-sat": "ev-sat" };
  var titles = { "ev-fri": "Friday", "ev-sat": "Saturday", "ev-other": "OTHER EVENT SHOULD NEVER SHOW" };

  function ev(id, rsvp, note, plus) {
    return { id: id, title: titles[id], start: "2026-11-21T23:00:00Z", start_max: null, end: null,
      location: "x", notes: null, banner: null, event_status: "live", rsvp: rsvp, note: note == null ? null : note,
      plus: plus || 0 };
  }
  // plus: an integer 0-9; omitted leaves it alone
  function badPlus(b) {
    return "plus" in b && !(Number.isInteger(b.plus) && b.plus >= 0 && b.plus <= 9);
  }
  function applyPlus(g, id, b) {
    if (!("plus" in b)) return;
    g.plus = g.plus || {};
    g.plus[id] = b.plus;
  }
  // the contract: trimmed; empty or null clears; over 200 is a 400; omitted leaves it alone
  function applyNote(g, id, b) {
    if (!("note" in b)) return true;
    var n = b.note == null ? "" : String(b.note).trim();
    if (n.length > 200) return false;
    g.notes = g.notes || {};
    if (n) g.notes[id] = n; else delete g.notes[id];
    return true;
  }
  function guestBody(g) {
    return { guest: { name: g.name }, host: { first_name: "Chris" }, claimed: !!g.claimed,
      events: Object.keys(g.answers).map(function (id) {
        return ev(id, g.claimed ? null : g.answers[id], g.claimed ? null : (g.notes || {})[id],
          g.claimed ? 0 : (g.plus || {})[id]);
      }) };
  }
  function normalize(p) {
    var d = String(p || "").replace(/[\s().-]/g, "");
    if (/^\+\d{7,15}$/.test(d)) return d;
    if (/^\d{10}$/.test(d)) return "+1" + d;
    if (/^1\d{10}$/.test(d)) return "+" + d;
    return null;
  }
  function byPhone(phone) {
    for (var t in db.guests) if (db.guests[t].phone === phone) return t;
    return null;
  }
  function reply(status, body) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(new Response(JSON.stringify(body), { status: status, headers: { "content-type": "application/json" } }));
      }, 250);
    });
  }

  window.fetch = function (url, opts) {
    opts = opts || {};
    var q = new URL(url).searchParams;
    if (opts.method === "POST") {
      (window.__stubPosts = window.__stubPosts || []).push(JSON.parse(opts.body));
      var b = JSON.parse(opts.body);
      if (failAll || (failPlus && "plus" in b)) return reply(500, { error: "server_error" });
      if (badPlus(b)) return reply(400, { error: "bad_request" });
      if (b.t) {
        var g = db.guests[b.t];
        if (!g || !(b.instance in g.answers)) return reply(404, { error: "not_found" });
        if (g.claimed) return reply(409, { error: "claimed" });
        if ("note" in b && String(b.note || "").trim().length > 200) return reply(400, { error: "bad_request" });
        g.answers[b.instance] = b.status;
        applyNote(g, b.instance, b);
        applyPlus(g, b.instance, b);
        save();
        return reply(200, guestBody(g));
      }
      var id = opens[b.o];
      if (!id) return reply(404, { error: "not_found" });
      if ("plus" in b && b.plus >= OPEN_CAP_PLUS) return reply(404, { error: "not_found" }); // the cap
      var phone = normalize(b.phone);
      var name = String(b.name || "").trim();
      if (!phone || !name || name.length > 80) return reply(400, { error: "bad_request" });
      if ("note" in b && String(b.note || "").trim().length > 200) return reply(400, { error: "bad_request" });
      var token = byPhone(phone);
      if (token && db.guests[token].claimed) return reply(409, { error: "claimed" });
      var created = !token;
      if (created) {
        token = "demo-g" + (++db.n);
        db.guests[token] = { name: name, phone: phone, answers: {} };
      }
      db.guests[token].answers[id] = b.status;
      applyNote(db.guests[token], id, b);
      applyPlus(db.guests[token], id, b);
      save();
      return reply(200, { created: created, token: created ? token : null, guest: null,
        host: { first_name: "Chris" }, events: [ev(id, b.status, (db.guests[token].notes || {})[id],
          "plus" in b ? b.plus : (db.guests[token].plus || {})[id])] });
    }
    if (q.get("t")) {
      var gg = db.guests[q.get("t")];
      return gg ? reply(200, guestBody(gg)) : reply(404, { error: "not_found" });
    }
    if (q.get("o")) {
      var oid = opens[q.get("o")];
      return oid ? reply(200, { guest: null, host: { first_name: "Chris" }, events: [ev(oid, null)] }) : reply(404, { error: "not_found" });
    }
    return reply(400, { error: "bad_request" });
  };
})();
