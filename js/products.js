/* =========================================================
   RK AESTHETICS — Product Catalogue
   Nine mini-products + the bundle, per the 2026 catalogue.
   Audience: Indian corporate professionals.
   ========================================================= */

const IMG = (id, w) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=${w || 900}`;

const CATEGORIES = [
  { key: "bundle", label: "The Bundle" },
  { key: "nutrition", label: "Nutrition" },
  { key: "training", label: "Training" },
  { key: "recovery", label: "Recovery & Stress" }
];

const PRODUCTS = [
  {
    id: "executive-body-system",
    number: "00",
    name: "The Executive Body System",
    category: "bundle",
    price: 1499,
    oldPrice: 3191,
    tag: "Best Value — Save 53%",
    format: "9 PDFs",
    duration: "Complete system",
    commitment: "Everything, one price",
    image: "images/05.jpeg",
    headline: "The whole system, for less than half of what the parts cost.",
    blurb: "All nine systems — diet, training, sleep, stress, travel, weekends and mobility.",
    description:
      "Every one of the nine products, bought together. The diet and training systems, the sleep and cortisol protocols, the three field guides for lunch, travel and weekends, and the ten-minute mobility routine. Bought individually these come to ₹3,191; together they are ₹1,499.",
    features: [
      "All nine PDFs, delivered instantly",
      "The Corporate Diet Plan and Corporate Workout Plan in full",
      "Sleep, cortisol and desk-mobility protocols",
      "Field guides for office lunch, business travel and weekends",
      "A 53% saving against buying the nine separately"
    ]
  },
  {
    id: "corporate-diet-plan",
    number: "01",
    name: "The Corporate Diet Plan",
    category: "nutrition",
    price: 499,
    oldPrice: null,
    tag: "Bestseller",
    format: "PDF",
    duration: "12-week system",
    commitment: "No separate cooking",
    image: "images/19.jpeg",
    headline: "You don't need to give up rice. You need to fix one meal.",
    blurb: "A fat-loss plan built for canteen food, 10pm dinners and five chais a day.",
    description:
      "A fat-loss eating system built around Indian food, canteen menus and ten-hour workdays. It works with a carb-heavy home kitchen, an unpredictable canteen, chai culture and a 10pm dinner rather than pretending none of them exist. No quinoa, no chicken and broccoli, no cooking a separate meal from your family.",
    features: [
      "The three levers that matter: protein, calories and steps",
      "Protein targets set per kilo of bodyweight, not guesswork",
      "A moderate deficit you can hold for twelve weeks",
      "Built for canteen plates, home kitchens and late dinners",
      "No separate cooking and no imported ingredients"
    ],
    objection:
      "\"I've tried diets.\" — Every plan you tried was built for someone who cooks their own food at fixed times. This one wasn't."
  },
  {
    id: "corporate-workout-plan",
    number: "02",
    name: "The Corporate Workout Plan",
    category: "training",
    price: 499,
    oldPrice: null,
    tag: "Bestseller",
    format: "PDF",
    duration: "4-day rotation",
    commitment: "3–4 sessions a week",
    image: "images/12.jpeg",
    headline: "A workout plan that survives a 9pm deployment.",
    blurb: "Four sessions on rotation, not on a schedule. Miss a day and nothing breaks.",
    description:
      "A four-day strength programme built on rotation rather than a fixed schedule. There are four workouts — A, B, C, D — and you do them in order whenever you reach the gym. Miss Tuesday and Tuesday's session simply happens on Wednesday. Nothing is ever missed, only delayed, so a bad week never turns into a restart.",
    features: [
      "Four rotating sessions — gym or home",
      "Rotation, not schedule: a missed day is only a delayed day",
      "A two-session floor that maintains everything you build",
      "Loading by reps-in-reserve, with full 2–4 minute rests",
      "A clear rule for when to add weight and when to add reps"
    ],
    objection:
      "\"I don't have time.\" — You don't have a fixed schedule. That's a different problem, and this solves it."
  },
  {
    id: "fixing-your-sleep-schedule",
    number: "03",
    name: "Fixing Your Sleep Schedule",
    category: "recovery",
    price: 299,
    oldPrice: null,
    tag: null,
    format: "PDF",
    duration: "14-day reset",
    commitment: "Wake time first",
    image: "images/45.jpeg",
    headline: "You don't have insomnia. You have a schedule.",
    blurb: "A 14-day reset for people who are wired at 11pm and dead at 7am.",
    description:
      "A fourteen-day reset for professionals who fall asleep at 1:30am, wake at seven, and run the day on coffee and adrenaline. It works on the three things that actually decide when you fall asleep — the light you've seen, when you last had caffeine, and how much unfinished work you carry to bed.",
    features: [
      "A 14-day reset schedule, day by day",
      "The four leaks that keep you awake, and the fix for each",
      "A caffeine curfew that accounts for a 5–6 hour half-life",
      "Morning daylight protocol for cab-to-basement-to-AC-floor days",
      "Why fixing wake time first makes bedtime follow"
    ],
    objection:
      "\"Nothing works for me.\" — You've been trying to sleep earlier. Fix the wake time first; bedtime follows."
  },
  {
    id: "cortisol-reset",
    number: "04",
    name: "The Cortisol Reset",
    category: "recovery",
    price: 399,
    oldPrice: null,
    tag: null,
    format: "PDF",
    duration: "Protocol + checklist",
    commitment: "No workload change",
    image: "images/28.jpeg",
    headline: "Eating less and still gaining around the belly? It isn't the food.",
    blurb: "The stress protocol for professionals who can't reduce their workload.",
    description:
      "Chronically elevated cortisol drives fat storage around the abdomen specifically, breaks down muscle, disrupts sleep and spikes late-afternoon sugar cravings. Most professionals recognise every symptom and have never connected them. This is a practical protocol for lowering chronic stress load without changing your job.",
    features: [
      "A self-check list to tell whether stress load is your real bottleneck",
      "Why abdominal fat behaves differently to fat elsewhere",
      "A protocol that assumes your workload is fixed",
      "How to clear stress faster rather than avoid it",
      "Where the 4pm sugar craving actually comes from"
    ],
    objection:
      "\"I can't reduce my stress.\" — You don't have to. You have to change how fast your body clears it."
  },
  {
    id: "office-lunch-guide",
    number: "05",
    name: "The Office Lunch Guide",
    category: "nutrition",
    price: 199,
    oldPrice: null,
    tag: "Start Here",
    format: "PDF",
    duration: "Field guide",
    commitment: "60 seconds to decide",
    image: IMG("1543352632-5a4b24e4d2a6"),
    headline: "The 3pm crash is a lunch problem.",
    blurb: "How to order a 500-calorie, 35g-protein meal in any canteen, on any app.",
    description:
      "A heavy rice-and-curry canteen plate is why you're useless from 2:30 to 4pm and raiding the vending machine by five. This is one repeatable decision framework that works whether you're in a canteen, ordering on a delivery app, or sitting in a client's boardroom — no dabba required.",
    features: [
      "One framework: protein first, vegetables second, carbs last and capped",
      "What a good office lunch looks like, component by component",
      "Ordering rules for canteens, delivery apps and client lunches",
      "How to cut roughly 30% of your carbs without deciding to",
      "Under 60 seconds of thinking per meal"
    ],
    objection:
      "\"I can't control office food.\" — You can't control the menu. You fully control the plate."
  },
  {
    id: "business-travel-nutrition",
    number: "06",
    name: "Business Travel Nutrition Plan",
    category: "nutrition",
    price: 299,
    oldPrice: null,
    tag: null,
    format: "PDF",
    duration: "Field guide",
    commitment: "Decided before you fly",
    image: "images/42.jpeg",
    headline: "Four days of travel shouldn't cost you three weeks of progress.",
    blurb: "Airports, hotel buffets and client dinners, pre-decided.",
    description:
      "Nobody gains fat on a business trip because hotel food is uniquely fattening. They gain it because every food decision gets made hungry, tired and on the spot. Ninety percent of this plan happens before you reach the airport, so that on the trip you execute rather than negotiate with yourself in a hotel lobby at 11pm.",
    features: [
      "Deliberately lowered targets — maintenance is the win on a short trip",
      "Airport, hotel buffet and client dinner playbooks",
      "What to pre-decide before you leave for the airport",
      "Separate approach for trips under four days and over a week",
      "A re-entry plan for the days after you land"
    ],
    objection:
      "\"Travel is out of my control.\" — The trip isn't the problem. Deciding while hungry and tired is."
  },
  {
    id: "weekend-eating-control",
    number: "07",
    name: "Weekend Eating Control Plan",
    category: "nutrition",
    price: 299,
    oldPrice: null,
    tag: null,
    format: "PDF",
    duration: "Two-event system",
    commitment: "Two meals, chosen",
    image: IMG("1606858374191-c18040e98ad7"),
    headline: "Five disciplined days. Two days that erase them.",
    blurb: "The maths of why your weight hasn't moved in four months — and the two-event fix.",
    description:
      "You're not failing. You're running a deficit for five days and a surplus for two, which nets out to nothing — and that's why the scale hasn't moved in four months. This is the system for eating normally on Friday night, Saturday brunch and Sunday family lunch without erasing the week.",
    features: [
      "The weekly arithmetic, laid out plainly",
      "The two-event rule for Friday, Saturday and Sunday",
      "How to eat at a family lunch without opting out",
      "What to do on Monday instead of punishing yourself",
      "No foods banned outright"
    ],
    objection:
      "\"I don't want to give up my weekend.\" — You're not giving up anything. You're choosing which two meals matter."
  },
  {
    id: "desk-job-mobility",
    number: "08",
    name: "The Desk-Job Mobility Plan",
    category: "recovery",
    price: 299,
    oldPrice: null,
    tag: null,
    format: "PDF",
    duration: "Daily routine",
    commitment: "10 min a day",
    image: "images/43.jpeg",
    headline: "Your lower back isn't old. It's been sitting for nine hours.",
    blurb: "Ten minutes a day for the neck, back, hips and shoulders a laptop rearranged.",
    description:
      "Nothing dramatic happens on any single day. Over three years a laptop and a chair rotate your shoulders forward, shorten your hip flexors, switch your glutes off and load your neck with the weight of a bowling ball held out in front of you. Ten minutes a day, aimed precisely at that.",
    features: [
      "A ten-minute daily routine for neck, upper back, hips and shoulders",
      "What nine hours of sitting does, area by area",
      "Why frequency of position change beats longer stretching",
      "Desk-side resets you can do without changing clothes",
      "What to do on the days your lower back is already sore"
    ],
    objection:
      "\"Stretching hasn't helped.\" — Stretching isn't the fix. Frequency of position change is."
  },
  {
    id: "three-day-executive-workout",
    number: "09",
    name: "The 3-Day Executive Workout",
    category: "training",
    price: 399,
    oldPrice: null,
    tag: null,
    format: "PDF",
    duration: "3-day split",
    commitment: "3 × 60 min a week",
    image: "images/21.jpeg",
    headline: "156 sessions a year. That's the whole secret.",
    blurb: "Three full-body sessions an hour each, with the rests that actually build strength.",
    description:
      "Three full-body sessions a week, done consistently for a year, beat five sessions done for six weeks and abandoned. This is not the beginner version of a real programme — for a working professional it is the real programme. Every muscle gets trained three times a week, and every session is self-contained, so two sessions still trains everything.",
    features: [
      "Three self-contained full-body sessions",
      "Full 2–4 minute rests, because that is what builds strength",
      "Every muscle trained three times a week",
      "A session you can drop to two without losing the week",
      "Budget an hour and take the rests — that's the method"
    ],
    objection:
      "\"Is three days enough?\" — Three days for a year beats five days for six weeks. Every time."
  }
];

function categoryLabel(key) {
  const c = CATEGORIES.find((c) => c.key === key);
  return c ? c.label : key;
}

function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

/* =========================================================
   PAYMENT LINKS — one Razorpay link per product.

   NOT IN USE RIGHT NOW: the files are free, and checkout hands them
   over as soon as the form is submitted. Kept here so switching
   payment back on is a matter of filling these in and restoring the
   buy buttons.

   HOW TO FILL THIS IN
   1. Razorpay Dashboard → Payment Links → Create Payment Link.
   2. Set the amount to match the price above, name it after the
      product, and turn ON "Collect customer email" — the delivery
      automation needs that address.
   3. Set the redirect/callback URL to:  thank-you.html on your domain
   4. Paste the link URL below, against the matching product id.

   A product with an empty link cannot be bought: its button says
   "Coming soon" instead of sending anyone to a broken page.
   ========================================================= */

const PAYMENT_LINKS = {
  "executive-body-system": "",
  "corporate-diet-plan": "",
  "corporate-workout-plan": "",
  "fixing-your-sleep-schedule": "",
  "cortisol-reset": "",
  "office-lunch-guide": "",
  "business-travel-nutrition": "",
  "weekend-eating-control": "",
  "desk-job-mobility": "",
  "three-day-executive-workout": ""
};

function getPaymentLink(id) {
  const link = PAYMENT_LINKS[id];
  return typeof link === "string" && link.trim() ? link.trim() : null;
}


/* =========================================================
   Digital files — what the reader downloads.
   Paths are relative to the site root and case-sensitive on most
   hosts, so keep the "Products" folder spelled exactly like this.
   The bundle grants every individual PDF rather than a file of its own.
   ========================================================= */

const PRODUCT_FILES = {
  "corporate-diet-plan": [
    { name: "The Corporate Diet Plan", file: "Products/01-the-corporate-diet-plan.pdf" }
  ],
  "corporate-workout-plan": [
    { name: "The Corporate Workout Plan", file: "Products/02-the-corporate-workout-plan.pdf" }
  ],
  "fixing-your-sleep-schedule": [
    { name: "Fixing Your Sleep Schedule", file: "Products/03-fixing-your-sleep-schedule.pdf" }
  ],
  "cortisol-reset": [
    { name: "The Cortisol Reset", file: "Products/04-the-cortisol-reset.pdf" }
  ],
  "office-lunch-guide": [
    { name: "The Office Lunch Guide", file: "Products/05-the-office-lunch-guide.pdf" }
  ],
  "business-travel-nutrition": [
    { name: "Business Travel Nutrition Plan", file: "Products/06-business-travel-nutrition-plan.pdf" }
  ],
  "weekend-eating-control": [
    { name: "Weekend Eating Control Plan", file: "Products/07-weekend-eating-control-plan.pdf" }
  ],
  "desk-job-mobility": [
    { name: "The Desk-Job Mobility Plan", file: "Products/08-the-desk-job-mobility-plan.pdf" }
  ],
  "three-day-executive-workout": [
    { name: "The 3-Day Executive Workout", file: "Products/09-the-3-day-executive-workout.pdf" }
  ],
  "executive-body-system": [
    { name: "Product Catalogue & Pricing", file: "Products/00-product-catalog-and-pricing.pdf" },
    { name: "The Corporate Diet Plan", file: "Products/01-the-corporate-diet-plan.pdf" },
    { name: "The Corporate Workout Plan", file: "Products/02-the-corporate-workout-plan.pdf" },
    { name: "Fixing Your Sleep Schedule", file: "Products/03-fixing-your-sleep-schedule.pdf" },
    { name: "The Cortisol Reset", file: "Products/04-the-cortisol-reset.pdf" },
    { name: "The Office Lunch Guide", file: "Products/05-the-office-lunch-guide.pdf" },
    { name: "Business Travel Nutrition Plan", file: "Products/06-business-travel-nutrition-plan.pdf" },
    { name: "Weekend Eating Control Plan", file: "Products/07-weekend-eating-control-plan.pdf" },
    { name: "The Desk-Job Mobility Plan", file: "Products/08-the-desk-job-mobility-plan.pdf" },
    { name: "The 3-Day Executive Workout", file: "Products/09-the-3-day-executive-workout.pdf" }
  ]
};

function getProductFiles(id) {
  return PRODUCT_FILES[id] || [];
}
