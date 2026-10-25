// Vercel Function: POST /api/leads
//
// Receives the report-download and partner-enquiry forms from index-v4.html,
// validates them and emails each lead to the La Tech Made in Italy team through
// Resend (https://resend.com).
//
// Environment variables (Vercel project settings):
//   RESEND_API_KEY  required. Resend API key.
//   LEADS_FROM      required. Sender on a domain verified in Resend,
//                   e.g. "Italian Tech Landscape <report@latechmadeinitaly.com>".
//   LEADS_TO        optional. Comma-separated recipients; defaults to the team below.
//   LEADS_WEBHOOK   optional. Also POSTs the lead as JSON (CRM, Zapier, Make).
//
// If email is not configured the function answers 503, so the page shows an
// error instead of losing the lead silently.

const DEFAULT_TO = ["max@latechmadeinitaly.com", "floriana@latechmadeinitaly.com", "rosa@latechmadeinitaly.com"];
const MAX = { name: 80, email: 254, company: 120, role: 120, message: 2000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function validate(body) {
  const errors = [];
  if (body.consent !== true) errors.push("consent");
  if (!EMAIL.test(clean(body.email, MAX.email))) errors.push("email");

  if (body.type === "report") {
    if (!clean(body.firstName, MAX.name)) errors.push("firstName");
    if (!clean(body.lastName, MAX.name)) errors.push("lastName");
    if (!clean(body.company, MAX.company)) errors.push("company");
    if (!clean(body.role, MAX.role)) errors.push("role");
    if (!clean(body.size, 20)) errors.push("size");
    if (!clean(body.interest, 80)) errors.push("interest");
  } else if (body.type === "partner") {
    if (!clean(body.name, MAX.name)) errors.push("name");
    if (!clean(body.company, MAX.company)) errors.push("company");
  } else {
    errors.push("type");
  }
  return errors;
}

function normalise(body) {
  return {
    type: body.type,
    firstName: clean(body.firstName, MAX.name),
    lastName: clean(body.lastName, MAX.name),
    name: clean(body.name, MAX.name),
    email: clean(body.email, MAX.email),
    company: clean(body.company, MAX.company),
    role: clean(body.role, MAX.role),
    size: clean(body.size, 20),
    interest: clean(body.interest, 80),
    tier: clean(body.tier, 20),
    message: clean(body.message, MAX.message),
    newsletter: body.newsletter === true,
    consent: true,
    lang: body.lang === "it" ? "it" : "en",
    page: clean(body.page, 200),
    submittedAt: clean(body.submittedAt, 40) || new Date().toISOString()
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The team reads Italian: labels and subject are in Italian
function email(lead) {
  const report = lead.type === "report";
  const who = report ? `${lead.firstName} ${lead.lastName}` : lead.name;
  const rows = report
    ? [["Nome", who], ["Email", lead.email], ["Azienda", lead.company], ["Ruolo", lead.role], ["Dimensione azienda", lead.size], ["Categoria di interesse", lead.interest], ["Newsletter", lead.newsletter ? "Sì" : "No"]]
    : [["Nome", who], ["Email", lead.email], ["Azienda", lead.company], ["Partnership", lead.tier || "Non ancora deciso"], ["Messaggio", lead.message || "—"]];
  rows.push(["Lingua del sito", lead.lang.toUpperCase()], ["Inviato il", lead.submittedAt]);
  const subject = report ? `Download report ITL 2026: ${who}, ${lead.company}` : `Richiesta partnership ITL 27: ${who}, ${lead.company}`;
  const html = `<h2 style="font-family:sans-serif">${esc(report ? "Nuovo download del report" : "Nuova richiesta di partnership")}</h2>
<table style="font-family:sans-serif;border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#3F4C66;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("")}</table>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  return { subject, html, text };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  const errors = validate(body);
  if (errors.length) {
    return Response.json({ ok: false, errors }, { status: 422 });
  }

  const { RESEND_API_KEY, LEADS_FROM, LEADS_TO, LEADS_WEBHOOK } = process.env;
  if (!RESEND_API_KEY || !LEADS_FROM) {
    return Response.json({ ok: false, error: "not-configured" }, { status: 503 });
  }

  const lead = normalise(body);
  const to = LEADS_TO ? LEADS_TO.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_TO;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: LEADS_FROM, to, reply_to: lead.email, ...email(lead) })
  });
  if (!res.ok) {
    console.error("resend", res.status, await res.text());
    return Response.json({ ok: false, error: "upstream" }, { status: 502 });
  }

  if (LEADS_WEBHOOK) {
    // best effort: the email already carries the lead
    await fetch(LEADS_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) }).catch((e) => console.error("webhook", e));
  }
  return Response.json({ ok: true });
}
