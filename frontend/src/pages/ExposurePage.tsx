import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Markdown } from '../components/Markdown'
import { LineageFlow } from '../components/lineage/LineageFlow'
import { useProjectStore } from '../stores/projectStore'
import { buildModelColumnsMap } from '../utils/modelColumns'
import { buildResourcePath, getResourcePageTypeFromId } from '../utils/resourceRoutes'

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
  const navigate = useNavigate()
  const { data, getExposure } = useProjectStore()

  const decodedId = id ? decodeURIComponent(id) : ''
  const exposure = decodedId ? getExposure(decodedId) : undefined

  const lineageSubgraph = useMemo(() => {
    if (!data?.lineage || !decodedId) return null

    const nodeIds = new Set<string>([decodedId, ...exposure?.depends_on ?? []])
    const nodes = data.lineage.nodes.filter((node) => nodeIds.has(node.id))
    const edges = data.lineage.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    )

    if (nodes.length === 0) return null

    return {
      nodes,
      edges,
      layer_config: data.lineage.layer_config,
    }
  }, [data?.lineage, decodedId, exposure?.depends_on])

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

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{exposure.name}</h1>
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-warning/10 text-warning">
            Exposure
          </span>
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

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Upstream Dependencies</h2>
        {exposure.depends_on.length === 0 ? (
          <div className="border border-[var(--border)] rounded-lg p-4 text-sm text-[var(--text-muted)]">
            No upstream dependencies are declared for this exposure.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {exposure.depends_on.map((dependencyId) => (
              <button
                key={dependencyId}
                onClick={() => navigate(buildResourcePath(dependencyId))}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)]
                           bg-[var(--bg-surface)] px-3 py-2 text-sm hover:border-primary/40
                           hover:text-primary transition-colors cursor-pointer"
                title={dependencyId}
              >
                <span className="text-xs uppercase text-[var(--text-muted)]">
                  {getResourcePageTypeFromId(dependencyId)}
                </span>
                <span className="font-medium">{dependencyId.split('.').pop() ?? dependencyId}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Lineage Context</h2>
        {lineageSubgraph ? (
          <div className="h-[560px]">
            <LineageFlow
              nodes={lineageSubgraph.nodes}
              edges={lineageSubgraph.edges}
              pinnedIds={new Set([decodedId])}
              layerConfig={lineageSubgraph.layer_config}
              modelColumns={modelColumns}
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
