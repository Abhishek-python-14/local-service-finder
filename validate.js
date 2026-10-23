// Pure validation shared by the browser and the Node server, so rules never drift apart.
export const PHONE_RE = /^(?:\+91|91|0)?[6-9]\d{9}$/;
export const normalizePhone = (v) => String(v ?? '').replace(/[\s\-()]/g, '');

// Is a date inside a provider's working hours? Works in India time (IST, UTC+5:30) whatever the device time zone.
export function inSlot(slot, date) {
  const t = new Date(date.getTime() + 5.5 * 36e5), mins = t.getUTCHours() * 60 + t.getUTCMinutes();
  return slot.days.includes(t.getUTCDay()) && mins >= slot.from * 60 && mins < slot.to * 60;
}

export function validateEnquiry(v, providers, now = new Date()) {
  const e = {}, provider = providers.find((p) => p.id === v.providerId);
  const name = String(v.name ?? '').trim();
  if (name.length < 2 || name.length > 60 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) e.name = 'Enter your full name (2–60 letters, Hindi or English).';
  if (!PHONE_RE.test(normalizePhone(v.phone))) e.phone = 'Enter a valid 10-digit Indian mobile number starting with 6–9.';
  if (!provider) e.providerId = 'Choose a provider from the list.';
  const desc = String(v.description ?? '').trim();
  if (desc.length < 10 || desc.length > 500) e.description = 'Describe the work in 10–500 characters.';
  const loc = String(v.locality ?? '').trim();
  if (loc.length < 3 || loc.length > 120) e.locality = 'Enter your locality or address (3–120 characters).';
  const when = new Date(v.when);
  if (!v.when || Number.isNaN(when.getTime())) e.when = 'Choose a preferred date and time.';
  else if (when <= now) e.when = 'Pick a date and time in the future.';
  else if (when - now > 90 * 864e5) e.when = 'Pick a date within the next 90 days.';
  else if (provider && !inSlot(provider.slot, when)) e.when = `${provider.name} works ${provider.availability} (India time). Pick a time in that window.`;
  if (v.consent !== true) e.consent = 'Please agree to be contacted about this enquiry.';
  return e;
}

export const cleanEnquiry = (v) => ({
  providerId: String(v.providerId),
  name: String(v.name).trim().replace(/\s+/g, ' '),
  phone: normalizePhone(v.phone).slice(-10),
  description: String(v.description).trim(),
  locality: String(v.locality).trim(),
  when: new Date(v.when).toISOString(),
  consent: true,
});

// Parse an availability string such as "Mon–Sat, 9 AM – 7 PM" into { days, from, to } (24-hour, India time).
const DAYSETS = { Daily: [0, 1, 2, 3, 4, 5, 6], 'Mon–Sat': [1, 2, 3, 4, 5, 6], 'Mon–Fri': [1, 2, 3, 4, 5], 'Sat–Sun': [6, 0] };
export function hoursOf(text) {
  const m = /^(Daily|Mon–Sat|Mon–Fri|Sat–Sun),\s*(\d+) (AM|PM) – (\d+) (AM|PM)/.exec(String(text ?? ''));
  if (!m) return null;
  const to24 = (h, ap) => (Number(h) % 12) + (ap === 'PM' ? 12 : 0);
  return { days: DAYSETS[m[1]], from: to24(m[2], m[3]), to: to24(m[4], m[5]) };
}
export const inHours = (hours, date) => (hours ? inSlot(hours, date) : false);
