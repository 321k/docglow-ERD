export type ResourcePageType = 'model' | 'source' | 'exposure'

export function getResourcePageTypeFromId(uniqueId: string): ResourcePageType {
  const resourceType = uniqueId.split('.')[0] ?? 'model'
  return getResourcePageTypeFromResourceType(resourceType)
}

export function getResourcePageTypeFromResourceType(resourceType: string): ResourcePageType {
  if (resourceType === 'source') return 'source'
  if (resourceType === 'exposure') return 'exposure'
  return 'model'
}

export function buildResourcePath(uniqueId: string, hash = ''): string {
  const pageType = getResourcePageTypeFromId(uniqueId)
  return `/${pageType}/${encodeURIComponent(uniqueId)}${hash}`
}
