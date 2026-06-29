import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Markdown } from '../components/Markdown'
import { LineageFlow } from '../components/lineage/LineageFlow'
import { TestBadge } from '../components/tests/TestBadge'
import { useProjectStore } from '../stores/projectStore'
import { getSubgraph } from '../utils/graph'
import { buildModelColumnsMap } from '../utils/modelColumns'
import type { TestStatus } from '../utils/colors'
import type { DocglowModel } from '../types'

const MATURITY_STYLES: Record<string, string> = {
  high: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-neutral/10 text-neutral',
}

interface UpstreamHealth {
  upstreamModels: number
  modelsWithTests: number
  totalTests: number
  pass: number
  warn: number
  fail: number
  overall: TestStatus
}

// Roll up test results across the exposure's resolvable upstream models so the
// page can surface a dbt-Explorer-style "data health" summary without any new
// data plumbing — every model already carries its own test_results.
function computeUpstreamHealth(
  dependsOn: string[],
  getModel: (uniqueId: string) => DocglowModel | undefined,
): UpstreamHealth | null {
  let upstreamModels = 0
  let modelsWithTests = 0
  let totalTests = 0
  let pass = 0
  let warn = 0
  let fail = 0

  for (const id of dependsOn) {
    const model = getModel(id)
    if (!model) continue
    upstreamModels += 1
    const results = model.test_results ?? []
    if (results.length > 0) modelsWithTests += 1
    for (const result of results) {
      switch (result.status) {
        case 'pass': pass += 1; totalTests += 1; break
        case 'warn': warn += 1; totalTests += 1; break
        case 'fail':
        case 'error': fail += 1; totalTests += 1; break
        default: break
      }
    }
  }

  if (upstreamModels === 0) return null

  const overall: TestStatus =
    fail > 0 ? 'fail' : warn > 0 ? 'warn' : totalTests > 0 ? 'pass' : 'none'

  return { upstreamModels, modelsWithTests, totalTests, pass, warn, fail, overall }
}

function formatOwner(owner: Record<string, string>): string | null {
  const preferred = ['name', 'email', 'team']
    .map((key) => owner[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  if (preferred.length > 0) return preferred.join(' · ')

  const pairs = Object.entries(owner)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value}`)

  return pairs.length > 0 ? pairs.join(' · ') : null
}

export function ExposurePage() {
  const { id } = useParams<{ id: string }>()
  const { data, getExposure, getModel } = useProjectStore()

  const decodedId = id ? decodeURIComponent(id) : ''
  const exposure = decodedId ? getExposure(decodedId) : undefined

  const upstreamHealth = useMemo(
    () => (exposure ? computeUpstreamHealth(exposure.depends_on, getModel) : null),
    [exposure, getModel],
  )

  // Exposures are terminal nodes — only their upstream chain is meaningful.
  const [depth, setDepth] = useState(2)
  const [lineageFullscreen, setLineageFullscreen] = useState(false)

  const lineageSubgraph = useMemo(() => {
    if (!data?.lineage || !decodedId) return null

    const { nodes, edges } = getSubgraph(
      decodedId,
      data.lineage.nodes,
      data.lineage.edges,
      depth,
      'upstream',
    )

    if (nodes.length === 0) return null

    return {
      nodes,
      edges,
      layer_config: data.lineage.layer_config,
    }
  }, [data?.lineage, decodedId, depth])

  const modelColumns = useMemo(() => {
    if (!data) return {}
    return buildModelColumnsMap(data)
  }, [data])

  if (!exposure) {
    return (
      <div className="text-[var(--text-muted)]">
        Exposure not found: {id ? decodeURIComponent(id) : 'unknown'}
      </div>
    )
  }

  const owner = formatOwner(exposure.owner)
  const maturity = exposure.maturity?.trim().toLowerCase()
  const title = exposure.label?.trim() || exposure.name

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h1 className="text-2xl font-bold">{title}</h1>
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-warning/10 text-warning">
              Exposure
            </span>
            {maturity && (
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded capitalize ${
                  MATURITY_STYLES[maturity] ?? 'bg-neutral/10 text-neutral'
                }`}
                title="Maturity is declared by the exposure's author in dbt (high / medium / low). It is not computed by Docglow."
              >
                {maturity}
              </span>
            )}
          </div>
          {exposure.url && (
            <a
              href={exposure.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm
                         font-medium text-white hover:brightness-110 transition-all"
            >
              Open in Dashboard
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
          {exposure.type && <span>Type: {exposure.type}</span>}
          <span>
            {exposure.depends_on.length} upstream {exposure.depends_on.length === 1 ? 'dependency' : 'dependencies'}
          </span>
          {owner && <span>Owner: {owner}</span>}
        </div>
        {exposure.description && (
          <Markdown content={exposure.description} className="mt-3 text-sm" />
        )}
      </div>

      {upstreamHealth && (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold">Upstream data health</h2>
            <TestBadge
              status={upstreamHealth.overall}
              label={
                upstreamHealth.overall === 'none'
                  ? 'no tests'
                  : upstreamHealth.overall === 'pass'
                    ? 'healthy'
                    : upstreamHealth.overall === 'warn'
                      ? 'warnings'
                      : 'failing'
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--text-muted)]">
            <span>
              {upstreamHealth.modelsWithTests}/{upstreamHealth.upstreamModels} upstream models tested
            </span>
            {upstreamHealth.totalTests > 0 ? (
              <span>
                {upstreamHealth.totalTests} tests:{' '}
                <span className="text-success">{upstreamHealth.pass} passing</span>
                {upstreamHealth.warn > 0 && <>, <span className="text-warning">{upstreamHealth.warn} warning</span></>}
                {upstreamHealth.fail > 0 && <>, <span className="text-danger">{upstreamHealth.fail} failing</span></>}
              </span>
            ) : (
              <span>No tests defined on upstream models.</span>
            )}
          </div>
        </div>
      )}

      {exposure.tags.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {exposure.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 text-xs rounded-full border border-[var(--border)] bg-[var(--bg-surface)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={lineageFullscreen ? 'fixed inset-0 z-50 bg-[var(--bg)] flex flex-col p-4' : ''}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2 shrink-0">
          <h2 className="text-lg font-semibold">Lineage Context</h2>
          {lineageSubgraph && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Depth</label>
              <input
                type="range"
                min={1}
                max={6}
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="w-20 accent-[var(--primary)]"
              />
              <span className="text-xs font-medium w-4 text-center">{depth}</span>
              <span className="text-xs text-[var(--text-muted)] ml-2">
                {lineageSubgraph.nodes.length} nodes · {lineageSubgraph.edges.length} edges
              </span>
              <div className="h-4 w-px bg-[var(--border)]" />
              {/* Fullscreen toggle */}
              <button
                onClick={() => setLineageFullscreen((f) => !f)}
                className="p-1 rounded hover:bg-[var(--bg-surface)] cursor-pointer transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
                title={lineageFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {lineageFullscreen ? (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" />
                  </svg>
                ) : (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
        {lineageSubgraph ? (
          <div
            className={lineageFullscreen ? 'flex-1 relative min-h-0' : 'relative'}
            style={lineageFullscreen ? undefined : { height: 'calc(100vh - 360px)', minHeight: 400 }}
          >
            <LineageFlow
              nodes={lineageSubgraph.nodes}
              edges={lineageSubgraph.edges}
              pinnedIds={new Set([decodedId])}
              layerConfig={lineageSubgraph.layer_config}
              modelColumns={modelColumns}
              onNavigateAway={() => setLineageFullscreen(false)}
            />
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-lg p-4 text-sm text-[var(--text-muted)]">
            No lineage context is available for this exposure.
          </div>
        )}
      </div>
    </div>
  )
}
