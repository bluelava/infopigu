import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"

export function AboutConceptDiagram(): JSX.Element {
  const { t } = useI18n()

  return (
    <figure className="about-concept-diagram card" style={{ margin: 0 }}>
      <svg aria-hidden="true" className="about-concept-svg" viewBox="0 0 780 260">
        <defs>
          <linearGradient id="diagram-compress-card" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
            <stop offset="100%" stopColor="rgba(248, 228, 195, 0.72)" />
          </linearGradient>
          <linearGradient id="diagram-filter-card" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.72)" />
            <stop offset="100%" stopColor="rgba(239, 224, 203, 0.76)" />
          </linearGradient>
          <linearGradient id="diagram-private-card" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.72)" />
            <stop offset="100%" stopColor="rgba(245, 226, 189, 0.8)" />
          </linearGradient>
          <linearGradient id="diagram-accent" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(247, 206, 130, 0.96)" />
            <stop offset="100%" stopColor="rgba(139, 94, 52, 0.96)" />
          </linearGradient>
          <linearGradient id="diagram-shield" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 244, 224, 0.95)" />
            <stop offset="100%" stopColor="rgba(214, 185, 148, 0.95)" />
          </linearGradient>
        </defs>

        <g className="about-concept-node-compress" transform="translate(20 34)">
          <rect fill="url(#diagram-compress-card)" height="178" rx="28" width="220" x="0" y="0" />
          <rect fill="rgba(139, 94, 52, 0.15)" height="18" rx="9" width="142" x="30" y="28" />
          <rect fill="rgba(139, 94, 52, 0.2)" height="18" rx="9" width="164" x="30" y="58" />
          <rect fill="rgba(139, 94, 52, 0.14)" height="18" rx="9" width="128" x="30" y="88" />
          <rect fill="rgba(139, 94, 52, 0.16)" height="18" rx="9" width="176" x="30" y="118" />
          <path
            d="M98 154c0 10 8 18 18 18h32c10 0 18-8 18-18"
            fill="none"
            stroke="rgba(139, 94, 52, 0.55)"
            strokeLinecap="round"
            strokeWidth="6"
          />
          <path
            d="M92 144l8 12 8-12M162 144l8 12 8-12"
            fill="none"
            stroke="rgba(139, 94, 52, 0.5)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <rect fill="url(#diagram-accent)" height="26" rx="12" width="78" x="70" y="154" />
          <rect fill="rgba(255,255,255,0.75)" height="6" rx="3" width="48" x="85" y="164" />
        </g>

        <g className="about-concept-node-filter" transform="translate(280 34)">
          <rect fill="url(#diagram-filter-card)" height="178" rx="28" width="220" x="0" y="0" />
          <circle cx="48" cy="40" fill="rgba(139, 94, 52, 0.18)" r="12" />
          <circle cx="78" cy="66" fill="rgba(139, 94, 52, 0.22)" r="10" />
          <circle cx="116" cy="44" fill="rgba(139, 94, 52, 0.14)" r="9" />
          <circle cx="146" cy="72" fill="rgba(139, 94, 52, 0.2)" r="11" />
          <path
            d="M34 96h154l-38 44-28 24v18l-22 12v-30l-28-24-38-44Z"
            fill="url(#diagram-accent)"
            opacity="0.96"
          />
          <path
            d="M60 112h102M72 128h78M86 144h48"
            fill="none"
            opacity="0.8"
            stroke="rgba(255,255,255,0.88)"
            strokeLinecap="round"
            strokeWidth="6"
          />
          <path
            d="M56 42c10 6 18 6 28 0M132 68c8-6 16-6 24 0"
            fill="none"
            opacity="0.46"
            stroke="rgba(139, 94, 52, 0.55)"
            strokeLinecap="round"
            strokeWidth="4"
          />
          <circle cx="92" cy="204" fill="rgba(139, 94, 52, 0.3)" r="6" />
          <circle cx="112" cy="194" fill="rgba(139, 94, 52, 0.7)" r="8" />
          <circle cx="132" cy="204" fill="rgba(139, 94, 52, 0.3)" r="6" />
        </g>

        <g className="about-concept-node-private" transform="translate(540 34)">
          <rect fill="url(#diagram-private-card)" height="178" rx="28" width="220" x="0" y="0" />
          <path
            d="M110 28 154 44v38c0 34-18 58-44 74-26-16-44-40-44-74V44l44-16Z"
            fill="url(#diagram-shield)"
            stroke="rgba(139, 94, 52, 0.42)"
            strokeWidth="4"
          />
          <rect fill="rgba(139, 94, 52, 0.16)" height="52" rx="12" width="66" x="77" y="74" />
          <rect fill="rgba(255,255,255,0.8)" height="8" rx="4" width="38" x="91" y="90" />
          <rect fill="rgba(255,255,255,0.7)" height="8" rx="4" width="30" x="91" y="104" />
          <path
            d="M96 70v-8c0-9 6-16 14-16s14 7 14 16v8"
            fill="none"
            stroke="rgba(139, 94, 52, 0.72)"
            strokeLinecap="round"
            strokeWidth="6"
          />
          <circle cx="48" cy="150" fill="rgba(139, 94, 52, 0.14)" r="14" />
          <circle cx="172" cy="54" fill="rgba(139, 94, 52, 0.14)" r="10" />
          <path
            d="M44 150h8M48 146v8M168 54h8M172 50v8"
            fill="none"
            stroke="rgba(139, 94, 52, 0.4)"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </g>
      </svg>
      <figcaption className="about-diagram-caption">
        <div className="about-diagram-label">
          <strong>{t("about.diagram.input.title")}</strong>
          <span>{t("about.diagram.input.body")}</span>
        </div>
        <div className="about-diagram-label">
          <strong>{t("about.diagram.funnel.title")}</strong>
          <span>{t("about.diagram.funnel.body")}</span>
        </div>
        <div className="about-diagram-label">
          <strong>{t("about.diagram.delta.title")}</strong>
          <span>{t("about.diagram.delta.body")}</span>
        </div>
      </figcaption>
    </figure>
  )
}
