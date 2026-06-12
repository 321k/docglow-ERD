// Renders RBAC access-attribute badges (PII / Restricted) derived from a dbt
// node or column's `meta.required_attributes`. dbt serialises the attribute
// values as the strings "true"/"false", so we treat string and boolean truthy
// values alike.
//
// These badges indicate which attribute a viewer must hold to see the model or
// column in the BI tools (Lightdash / Metabase) — the docs site shows *what* is
// gated, not *who* holds the attribute.

type MetaLike = Record<string, unknown> | null | undefined

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  return false
}

interface AccessBadgesProps {
  meta?: MetaLike
  /** 'sm' for model header, 'xs' for dense column rows. */
  size?: 'sm' | 'xs'
  className?: string
}

const BADGES: { key: string; label: string; color: string; bg: string; title: string }[] = [
  {
    key: 'has_pii_access',
    label: 'PII',
    color: '#dc2626',
    bg: '#dc262618',
    title: 'Requires the has_pii_access attribute — visible only to viewers granted PII access in the BI tools',
  },
  {
    key: 'has_restricted_access',
    label: 'Restricted',
    color: '#d97706',
    bg: '#d9770618',
    title: 'Requires the has_restricted_access attribute — visible only to viewers granted restricted access in the BI tools',
  },
]

export function AccessBadges({ meta, size = 'sm', className }: AccessBadgesProps) {
  const required = (meta?.required_attributes ?? null) as MetaLike
  if (!required) return null

  const active = BADGES.filter(b => isTruthy(required[b.key]))
  if (active.length === 0) return null

  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'

  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {active.map(b => (
        <span
          key={b.key}
          className={`inline-flex items-center gap-1 rounded font-semibold ${pad}`}
          title={b.title}
          style={{ background: b.bg, color: b.color }}
        >
          <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          {b.label}
        </span>
      ))}
    </div>
  )
}
