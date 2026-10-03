/** Плетёная корзинка в зелёной палитре ВкусВилла; качаются листья, при работе падают овощи. */
export default function GroceryArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-groc ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <radialGradient id="groc-glow" cx="50%" cy="75%" r="60%">
          <stop offset="0%" stopColor="#4cc96b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4cc96b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="groc-basket" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9a35b" />
          <stop offset="100%" stopColor="#8a5a22" />
        </linearGradient>
      </defs>
      <rect width="240" height="110" fill="url(#groc-glow)" />

      {/* листья на фоне */}
      <path className="groc-leaf groc-leaf--1" d="M30 90 q-6 -40 30 -60 q4 40 -30 60z" fill="#2e7d32" opacity="0.55" />
      <path className="groc-leaf groc-leaf--2" d="M210 92 q8 -42 -26 -64 q-6 42 26 64z" fill="#43a047" opacity="0.5" />
      <path className="groc-leaf groc-leaf--3" d="M190 100 q-2 -24 22 -36 q0 26 -22 36z" fill="#66bb6a" opacity="0.45" />

      {/* овощи — при работе падают в корзинку */}
      <g className="groc-veg groc-veg--carrot">
        <path d="M100 40 l10 -4 -4 30z" fill="#ff8a1f" />
        <path d="M104 37 l-6 -10 M106 36 l0 -12 M108 36 l6 -10" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="groc-veg groc-veg--apple">
        <circle cx="128" cy="50" r="10" fill="#e53935" />
        <circle cx="124" cy="46" r="3" fill="#ff8a80" opacity="0.7" />
        <path d="M128 40 q4 -6 9 -5 q-3 5 -9 5z" fill="#43a047" />
      </g>
      <g className="groc-veg groc-veg--broc">
        <circle cx="146" cy="44" r="6" fill="#2e7d32" />
        <circle cx="152" cy="40" r="6" fill="#388e3c" />
        <circle cx="157" cy="46" r="6" fill="#2e7d32" />
        <rect x="149" y="47" width="5" height="12" rx="2" fill="#81c784" />
      </g>

      {/* корзинка */}
      <g className="groc-basket">
        <path d="M84 62 q36 -40 72 0" fill="none" stroke="#8a5a22" strokeWidth="5" strokeLinecap="round" />
        <path d="M78 62 h84 l-10 40 h-64 z" fill="url(#groc-basket)" />
        <path d="M82 72 h76 M85 82 h70 M88 92 h64" stroke="#6b4318" strokeWidth="2" opacity="0.6" />
        <path d="M98 62 l4 40 M120 62 v40 M142 62 l-4 40" stroke="#6b4318" strokeWidth="2" opacity="0.6" />
        <rect x="76" y="58" width="88" height="7" rx="3.5" fill="#4cc96b" />
      </g>
    </svg>
  )
}
