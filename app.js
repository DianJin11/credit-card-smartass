// ─── Card data ───────────────────────────────────────────────────────────────

const CARD_FILES = [
  'rewards-context/amex-gold.json',
  'rewards-context/chase-sapphire-reserve.json',
  'rewards-context/wells-fargo-autograph.json'
];

// Brand accent colors for visual distinction
const CARD_COLORS = {
  'amex-gold':              '#b8860b',
  'chase-sapphire-reserve': '#1a3a6b',
  'wells-fargo-autograph':  '#c8102e'
};

const CATEGORY_LABELS = {
  dining:              'Dining',
  grocery:             'Groceries',
  airline:             'Airline (via portal)',
  hotel:               'Hotel (via portal)',
  travel:              'Travel',
  gas:                 'Gas & EV Charging',
  transit:             'Transit & Rideshare',
  streaming:           'Streaming',
  phone:               'Phone Plan',
  lyft:                'Lyft (5X CSR bonus)',
  car_rental:          'Car Rental',
  ubereats:            'Uber Eats',
  doordash:            'DoorDash',
  doordash_food:       'DoorDash (Restaurant)',
  doordash_nonfood:    'DoorDash (Non-food)',
  chase_travel_portal: 'Chase Travel Portal',
  default:             'General Purchase'
};

let cards = [];

// ─── Load cards ───────────────────────────────────────────────────────────────

async function loadCards() {
  cards = await Promise.all(
    CARD_FILES.map(f => fetch(f).then(r => r.json()))
  );
}

// ─── Matching logic ───────────────────────────────────────────────────────────

// Returns the category key for a given transaction string and card.
// Checks longer keywords first so more specific phrases win (e.g. "gas station"
// beats "gas" if both are in the map).
function matchCategory(input, card) {
  const lower = input.toLowerCase();
  const entries = Object.entries(card.category_map)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [keyword, category] of entries) {
    if (lower.includes(keyword)) return category;
  }
  return 'default';
}

// Returns the earning rate object for a card + category.
// Special rule: user always books travel through portals, so CSR earns 8X
// (chase_travel_portal) rather than the 4X direct rate for airline/hotel.
function getEarningRate(card, category) {
  if (
    card.id === 'chase-sapphire-reserve' &&
    (category === 'airline' || category === 'hotel')
  ) {
    return { ...card.earning_rates.chase_travel_portal, usingPortal: true };
  }
  return card.earning_rates[category] || card.earning_rates.default;
}

// ─── Evaluation & ranking ─────────────────────────────────────────────────────

function evaluateCard(card, input) {
  const category       = matchCategory(input, card);
  const rate           = getEarningRate(card, category);
  const cpp            = card.point_valuation.cpp_for_ranking;   // cents per point
  const centsPerDollar = rate.multiplier * cpp;

  return { card, category, rate, cpp, centsPerDollar };
}

function rankCards(input) {
  return cards
    .map(card => evaluateCard(card, input))
    .sort((a, b) => b.centsPerDollar - a.centsPerDollar);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function formatValue(centsPerDollar, amount) {
  if (amount && amount > 0) {
    const dollars = (centsPerDollar / 100) * amount;
    return {
      main:  '$' + dollars.toFixed(2),
      label: `in travel rewards on a $${parseFloat(amount).toFixed(2)} purchase`
    };
  }
  return {
    main:  centsPerDollar.toFixed(2) + '¢',
    label: 'per $1 spent'
  };
}

function getCategoryLabel(result) {
  if (result.rate.usingPortal && result.category === 'hotel') return CATEGORY_LABELS['hotel'];
  if (result.rate.usingPortal) return CATEGORY_LABELS['airline'];
  return CATEGORY_LABELS[result.category] || result.category;
}

function renderResults(ranked, amount) {
  const container = document.getElementById('results');
  container.innerHTML = '';

  const RANK_LABELS = ['Best Choice', '2nd', '3rd'];

  ranked.forEach((result, i) => {
    const { card, category, rate, cpp, centsPerDollar } = result;
    const color    = CARD_COLORS[card.id] || '#555';
    const isWinner = i === 0;
    const value    = formatValue(centsPerDollar, amount);
    const catLabel = getCategoryLabel(result);

    const el = document.createElement('div');
    el.className = `card-result${isWinner ? ' winner' : ''}`;
    el.style.borderLeftColor = color;

    // Pull any booking insight from the card data
    const insightKey = category === 'hotel' || (rate.usingPortal && category === 'airline')
      ? 'hotel'
      : category;
    const insight = card.booking_insights?.[insightKey];

    el.innerHTML = `
      <div class="rank-label" style="color:${color}">
        ${RANK_LABELS[i] ?? `${i + 1}th`}
      </div>
      <div class="card-name">${card.name}</div>
      <div class="value-row">
        <span class="value-main">${value.main}</span>
        <span class="value-label">${value.label}</span>
      </div>
      <div class="rate-detail">
        <strong>${rate.multiplier}X ${card.points_currency}</strong>
        &times; ${cpp}&cent;/pt &middot; <strong>${catLabel}</strong>
      </div>
      ${rate.usingPortal ? `
        <div class="portal-tip">
          Booked via Chase Travel portal — 8X rate applied
        </div>` : ''}
      ${insight ? `<div class="insight">${insight}</div>` : ''}
    `;

    container.appendChild(el);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Show loading state
  document.getElementById('results').innerHTML =
    '<p class="hint">Loading card data…</p>';

  try {
    await loadCards();
  } catch (e) {
    document.getElementById('results').innerHTML =
      '<p class="error-msg">Could not load card data. Open this page from a web server, not directly from the filesystem.</p>';
    return;
  }

  document.getElementById('results').innerHTML =
    '<p class="hint">Describe a purchase above to see which card wins.</p>';

  const txInput     = document.getElementById('transaction');
  const amountInput = document.getElementById('amount');
  const btn         = document.getElementById('submit');
  const results     = document.getElementById('results');

  function evaluate() {
    const tx = txInput.value.trim();
    if (!tx) {
      results.innerHTML = '<p class="hint">Describe a purchase above to see which card wins.</p>';
      return;
    }
    const amount = parseFloat(amountInput.value) || null;
    const ranked = rankCards(tx);
    renderResults(ranked, amount);
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  btn.addEventListener('click', evaluate);
  txInput.addEventListener('keydown',     e => { if (e.key === 'Enter') evaluate(); });
  amountInput.addEventListener('keydown', e => { if (e.key === 'Enter') evaluate(); });
}

init();
