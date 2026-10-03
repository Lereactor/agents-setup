/** Щит в центре радара: луч непрерывно обходит круг, вспыхивают точки-агенты. */
export default function WatchdogArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-watch ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <radialGradient id="watch-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#b18cff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#b18cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="watch-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b18cff" stopOpacity="0" />
          <stop offset="100%" stopColor="#d6c2ff" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="watch-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9b6dff" />
          <stop offset="100%" stopColor="#5b2fc9" />
        </linearGradient>
      </defs>
      <rect width="240" height="110" fill="url(#watch-glow)" />

      <g fill="none" stroke="#6d5a9e" strokeOpacity="0.55">
        <circle cx="120" cy="55" r="48" />
        <circle cx="120" cy="55" r="34" />
        <circle cx="120" cy="55" r="20" />
        <path d="M72 55 h96 M120 7 v96" strokeOpacity="0.3" />
      </g>

      {/* луч радара */}
      <g className="watch-sweep">
        <path d="M120 55 L168 55 A48 48 0 0 0 153.9 21.1 Z" fill="url(#watch-beam)" />
      </g>

      {/* точки-агенты на радаре */}
      <circle className="watch-blip watch-blip--1" cx="148" cy="34" r="3.5" fill="#3d8bff" />
      <circle className="watch-blip watch-blip--2" cx="92" cy="76" r="3.5" fill="#4cc96b" />
      <circle className="watch-blip watch-blip--3" cx="150" cy="80" r="3.5" fill="#ffb347" />

      {/* щит */}
      <g className="watch-shield">
        <path d="M120 36 l16 6 v12 q0 14 -16 21 q-16 -7 -16 -21 v-12z" fill="url(#watch-shield)" stroke="#e3d6ff" strokeWidth="1.5" />
        <path d="M113 55 l5 5 9 -10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
