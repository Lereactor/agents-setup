/** Пакет покупок в сине-жёлтой палитре Ozon/Я.Маркета; при работе выпрыгивают ценники. */
export default function ShoppingArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-shop ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <radialGradient id="shop-glow" cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#2f80ff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#2f80ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="shop-bag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f8bff" />
          <stop offset="100%" stopColor="#0047d6" />
        </linearGradient>
        <linearGradient id="shop-tag" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe066" />
          <stop offset="100%" stopColor="#ffb800" />
        </linearGradient>
      </defs>
      <rect width="240" height="110" fill="url(#shop-glow)" />

      {/* ценники — выпрыгивают из пакета */}
      <g className="shop-tag shop-tag--1">
        <path d="M100 52 l14 -8 h16 v18 h-16 z" fill="url(#shop-tag)" />
        <circle cx="111" cy="53" r="2" fill="#7a5600" />
        <text x="122" y="57" fontSize="10" fontWeight="700" fill="#5a3f00" textAnchor="middle">₽</text>
      </g>
      <g className="shop-tag shop-tag--2">
        <path d="M112 52 l14 -8 h16 v18 h-16 z" fill="url(#shop-tag)" />
        <circle cx="123" cy="53" r="2" fill="#7a5600" />
        <text x="134" y="57" fontSize="10" fontWeight="700" fill="#5a3f00" textAnchor="middle">%</text>
      </g>
      <g className="shop-tag shop-tag--3">
        <path d="M106 52 l14 -8 h16 v18 h-16 z" fill="url(#shop-tag)" />
        <circle cx="117" cy="53" r="2" fill="#7a5600" />
        <text x="128" y="57" fontSize="10" fontWeight="700" fill="#5a3f00" textAnchor="middle">★</text>
      </g>

      {/* пакет */}
      <g className="shop-bag">
        <path d="M98 44 q0 -22 22 -22 q22 0 22 22" fill="none" stroke="#1f5fd1" strokeWidth="5" strokeLinecap="round" />
        <path d="M86 46 h68 l6 54 h-80 z" fill="url(#shop-bag)" />
        <path d="M86 46 h68 l1 8 h-70 z" fill="#ffcc00" />
        <path d="M112 74 q8 8 16 0" fill="none" stroke="#cfe0ff" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* искры */}
      <g className="shop-spark">
        <path d="M60 30 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" fill="#ffd84d" />
        <path d="M182 22 l1.5 4.5 4.5 1.5 -4.5 1.5 -1.5 4.5 -1.5 -4.5 -4.5 -1.5 4.5 -1.5z" fill="#8fc1ff" />
        <path d="M176 76 l1.5 4.5 4.5 1.5 -4.5 1.5 -1.5 4.5 -1.5 -4.5 -4.5 -1.5 4.5 -1.5z" fill="#ffd84d" />
      </g>
    </svg>
  )
}
