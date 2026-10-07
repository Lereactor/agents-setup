/** Вечер в тёплой оранжевой палитре: домик у ёлок, из трубы вьётся дым, мерцают звёзды;
 *  при работе зажигаются окна, дым идёт гуще и выпрыгивает ключ от жилья. */
export default function BookingArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-book ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <radialGradient id="book-glow" cx="50%" cy="85%" r="65%">
          <stop offset="0%" stopColor="#ff8a65" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ff8a65" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="book-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c98a5e" />
          <stop offset="100%" stopColor="#8a5a3a" />
        </linearGradient>
      </defs>
      <rect width="240" height="110" fill="url(#book-glow)" />

      {/* звёзды */}
      <g fill="#ffe9c7">
        <circle className="book-star" cx="30" cy="18" r="1.3" />
        <circle className="book-star book-star--2" cx="62" cy="10" r="1" />
        <circle className="book-star book-star--3" cx="196" cy="14" r="1.3" />
        <circle className="book-star book-star--2" cx="218" cy="30" r="1" />
      </g>

      {/* ёлки */}
      <path d="M30 98 l12 -30 12 30z M36 80 l6 -18 6 18z" fill="#2f5a46" />
      <path d="M190 98 l14 -36 14 36z M197 76 l7 -20 7 20z" fill="#2f5a46" />

      {/* дым из трубы */}
      <g className="book-smoke" fill="#e9dfd6">
        <circle className="book-puff" cx="141" cy="36" r="4" />
        <circle className="book-puff book-puff--2" cx="141" cy="36" r="4" />
        <circle className="book-puff book-puff--3" cx="141" cy="36" r="4" />
      </g>

      {/* домик */}
      <rect x="136" y="38" width="10" height="16" fill="#6b4630" />
      <path d="M78 62 l42 -30 42 30z" fill="#a8452f" />
      <rect x="86" y="62" width="68" height="36" fill="url(#book-wall)" />
      <rect x="112" y="74" width="16" height="24" rx="2" fill="#4a2e1e" />
      <rect className="book-window" x="93" y="70" width="13" height="11" rx="1.5" />
      <rect className="book-window book-window--2" x="134" y="70" width="13" height="11" rx="1.5" />
      <path d="M99.5 70 v11 M93 75.5 h13 M140.5 70 v11 M134 75.5 h13" stroke="#6b4630" strokeWidth="1.2" />

      {/* ключ — выпрыгивает при работе */}
      <g className="book-key">
        <circle cx="60" cy="64" r="7" fill="none" stroke="#ffd166" strokeWidth="3" />
        <path d="M67 64 h20 M80 64 v6 M85 64 v5" stroke="#ffd166" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* земля */}
      <path d="M0 98 h240" stroke="#6b5a4e" strokeWidth="2" />
    </svg>
  )
}
