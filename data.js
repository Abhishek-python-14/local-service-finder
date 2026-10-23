// DEMO DATA: every provider, rating, review, price and phone number below is fictional.
// DEMO_MODE=true switches off Call/WhatsApp because fictional numbers could belong to real people.
// Set it to false only after replacing the data with real providers who consented to be listed.
export const DEMO_MODE = true; // kept for reference; buttons now depend on TEST_PHONE / real providers (see js/app.js)

// TESTING: put YOUR OWN 10-digit mobile number here (e.g. '9876543210').
// Call and WhatsApp buttons for the sample providers will then go to YOUR number, never to the fictional ones.
// Leave '' to keep sample-provider contact buttons switched off.
export const TEST_PHONE = '';

export const CATEGORIES = [
  { id: 'electrician', label: 'Electricians', icon: 'zap', blurb: 'Wiring, fittings and fault repair' },
  { id: 'plumber', label: 'Plumbers', icon: 'droplets', blurb: 'Leaks, taps and pipe fitting' },
  { id: 'tutor', label: 'Tutors', icon: 'graduation-cap', blurb: 'School and exam coaching at home' },
  { id: 'repair', label: 'Repair Services', icon: 'wrench', blurb: 'AC, fridge and appliance repair' },
];
export const LOCALITIES = ['Alpha 1', 'Alpha 2', 'Beta 1', 'Gamma 1', 'Pari Chowk', 'Knowledge Park III', 'Gaur City'];

// Approximate demo coordinates per locality (not real addresses); each provider gets a small deterministic offset.
export const COORDS = { 'Alpha 1': [28.4745, 77.5040], 'Alpha 2': [28.4698, 77.5083], 'Beta 1': [28.4722, 77.5136], 'Gamma 1': [28.4655, 77.5192], 'Pari Chowk': [28.4640, 77.5030], 'Knowledge Park III': [28.4790, 77.4960], 'Gaur City': [28.6050, 77.4290] };
const jitter = (id, k) => (((Number(id.slice(1)) * k) % 21) - 10) / 2000; // about ±250 m

// Working hours are in India time (IST). 0 = Sunday.
const DAYS = { all: [0, 1, 2, 3, 4, 5, 6], monSat: [1, 2, 3, 4, 5, 6], monFri: [1, 2, 3, 4, 5], satSun: [6, 0] };
const DAY_LABEL = new Map([[DAYS.all, 'Daily'], [DAYS.monSat, 'Mon–Sat'], [DAYS.monFri, 'Mon–Fri'], [DAYS.satSun, 'Sat–Sun']]);
const h12 = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

// Indicative service list per category: [name, multiple of the provider's starting price].
const SERVICES = {
  electrician: [['Switch or socket repair', 1], ['Fan or light fitting', 1.2], ['Full-room rewiring', 8]],
  plumber: [['Tap or leak repair', 1], ['Geyser or basin fitting', 2.5], ['Bathroom pipe work', 6]],
  tutor: [['Trial class', 0.5], ['One-to-one at home (per hour)', 1], ['Exam crash course (10 hours)', 9]],
  repair: [['Inspection and diagnosis', 1], ['Standard servicing', 1.5], ['Part replacement (parts extra)', 2.5]],
};
const REVIEWS = { // fictional reviewers and text
  electrician: [['Neha S.', 5, 'Arrived on time and fixed the tripping MCB in under an hour.'], ['Karan M.', 4, 'Neat work and explained the fault clearly. Price matched the estimate.'], ['Pooja R.', 5, 'Fitted three ceiling fans without leaving a mess.'], ['Imtiaz A.', 4, 'Good work. Slightly late but called ahead.']],
  plumber: [['Rohit G.', 5, 'Stopped a leaking pipe the same evening.'], ['Anita D.', 4, 'Clean work on the bathroom fittings. Fair price.'], ['Mohit T.', 5, 'Cleared a blocked drain that two others could not.'], ['Sana K.', 4, 'Polite and punctual. Would call again.']],
  tutor: [['Parent of Class 8 student', 5, 'My son’s test scores improved within two months.'], ['Riya B.', 4, 'Explains concepts patiently and gives useful practice sets.'], ['Parent of Class 10 student', 5, 'Regular feedback and well-planned revision before exams.'], ['Aakash P.', 4, 'Flexible timings and clear explanations.']],
  repair: [['Deepa V.', 5, 'Found the cooling fault quickly and the AC works well now.'], ['Harsh N.', 4, 'Honest about which part needed replacing and what it would cost.'], ['Mehak L.', 5, 'Washing machine repaired in one visit.'], ['Zubair F.', 4, 'Professional and tidy. Gave a clear estimate first.']],
};
const LANGS = [['Hindi', 'English'], ['Hindi'], ['Hindi', 'English', 'Urdu'], ['Hindi', 'English', 'Punjabi']];

const d = (id, name, title, category, locality, experience, price, unit, rating, reviews, phone, photo, [days, from, to], description) => {
  const n = Number(id.slice(1)), pool = REVIEWS[category];
  return {
    id, name, title, category, locality, experience, price, unit, rating, reviews, phone, photo, description, demo: true,
    slot: { days, from, to }, availability: `${DAY_LABEL.get(days)}, ${h12(from)} – ${h12(to)}`,
    services: SERVICES[category].map(([label, f]) => ({ name: label, price: Math.max(50, Math.round((price * f) / 10) * 10) })),
    languages: LANGS[n % LANGS.length],
    sampleReviews: [pool[n % 4], pool[(n + 1) % 4]].map(([by, stars, text]) => ({ by, stars, text })),
    lat: COORDS[locality][0] + jitter(id, 7), lng: COORDS[locality][1] + jitter(id, 13),
  };
};

export const PROVIDERS = [
  d('p101', 'Rakesh Sharma', 'Home wiring and fault finding', 'electrician', 'Alpha 1', 9, 299, 'visit', 4.8, 142, '9000000101', 12, [DAYS.monSat, 9, 19], 'Handles switchboard repair, MCB replacement, fan and light fitting, and full-room rewiring for flats and independent houses.'),
  d('p102', 'Sunil Yadav', 'Fans, lights and inverter fitting', 'electrician', 'Gaur City', 6, 249, 'visit', 4.5, 87, '9000000102', 15, [DAYS.all, 8, 20], 'Quick fixes for tripping circuits, new fan and light installs, and inverter and UPS connections.'),
  d('p103', 'Imran Khan', 'Wiring audits and load upgrades', 'electrician', 'Pari Chowk', 12, 349, 'visit', 4.9, 203, '9000000103', 33, [DAYS.all, 8, 21], 'Safety checks, earthing, meter-load upgrades and neat concealed wiring for renovations.'),
  d('p104', 'Manoj Tiwari', 'Leak repair and bathroom fittings', 'plumber', 'Knowledge Park III', 10, 199, 'visit', 4.6, 119, '9000000104', 52, [DAYS.monSat, 8, 18], 'Tap, flush tank and pipe leakage repair, geyser fitting and complete bathroom fixture installation.'),
  d('p105', 'Deepak Singh', 'Drain cleaning and water tanks', 'plumber', 'Beta 1', 5, 179, 'visit', 4.3, 64, '9000000105', 59, [DAYS.all, 7, 19], 'Blocked drain clearing, overhead tank connections and motor pump fitting at small-job rates.'),
  d('p106', 'Anil Gupta', 'Kitchen and bathroom plumbing', 'plumber', 'Alpha 2', 14, 299, 'visit', 4.8, 176, '9000000106', 60, [DAYS.monSat, 9, 17], 'Concealed pipe work, RO and water purifier plumbing, and full bathroom renovations.'),
  d('p107', 'Priya Mehta', 'Maths and Science, classes 6–10', 'tutor', 'Gaur City', 7, 500, 'hour', 4.9, 96, '9000000107', 45, [DAYS.monFri, 16, 20], 'Concept-first teaching with weekly tests for CBSE students. Home visits within Gaur City.'),
  d('p108', 'Aditya Joshi', 'Coding and computer science basics', 'tutor', 'Knowledge Park III', 4, 400, 'hour', 4.6, 58, '9000000108', 14, [DAYS.satSun, 10, 18], 'Beginner Python and web basics for school and early college students, with small projects.'),
  d('p109', 'Neha Kapoor', 'English and spoken communication', 'tutor', 'Pari Chowk', 9, 650, 'hour', 4.7, 131, '9000000109', 47, [DAYS.monSat, 15, 21], 'Grammar, writing and interview speaking practice for school students and job seekers.'),
  d('p110', 'Vikram Chauhan', 'AC service and gas refilling', 'repair', 'Alpha 1', 11, 399, 'visit', 4.7, 158, '9000000110', 53, [DAYS.all, 9, 20], 'Split and window AC servicing, gas top-up, PCB faults and new AC installation.'),
  d('p111', 'Farhan Ali', 'Washing machine and microwave repair', 'repair', 'Beta 1', 8, 299, 'visit', 4.4, 72, '9000000111', 68, [DAYS.monSat, 10, 19], 'Diagnoses and repairs top-load and front-load washing machines, microwaves and mixers.'),
  d('p112', 'Sanjay Rawat', 'Refrigerator and AC repair', 'repair', 'Gamma 1', 13, 449, 'visit', 4.8, 189, '9000000112', 70, [DAYS.all, 8, 21], 'Cooling issues, compressor and gas problems for refrigerators, plus AC repair and annual service plans.'),
];

// Indicative price ranges and sample reviews per category (fictional; used on provider profiles).
export const SERVICE_MENU = {
  electrician: [['Switch or socket repair', '₹199–₹399'], ['Fan or light fitting', '₹249–₹499'], ['Full-room rewiring', '₹2,500–₹6,000']],
  plumber: [['Tap or leak repair', '₹179–₹399'], ['Geyser or basin fitting', '₹399–₹899'], ['Bathroom pipe work', '₹1,200–₹4,000']],
  tutor: [['Trial class', '₹250–₹350'], ['One-to-one at home, per hour', '₹400–₹650'], ['Exam crash course (10 hours)', '₹3,600–₹5,850']],
  repair: [['Inspection and diagnosis', '₹299–₹449'], ['Standard servicing', '₹449–₹699'], ['Part replacement (parts extra)', '₹749–₹1,100']],
};
export const SAMPLE_REVIEWS = Object.fromEntries(Object.entries(REVIEWS).map(([k, v]) => [k, v.slice(0, 2).map(([by, , text]) => [by, text])]));
