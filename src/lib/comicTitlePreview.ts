/**
 * Client-side comic title/description preview — mirrors the edge function logic
 * so operators can see what Shopify will receive before syncing.
 */

const MONTH_NAMES = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
]

function parsePublicationDate(dateStr?: string | null): { month: string; year: string } | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  const m = dateStr.trim().match(/^(\d{4})-(\d{1,2})/)
  if (!m) {
    const yearOnly = dateStr.trim().match(/^(\d{4})$/)
    if (yearOnly) return { month: '', year: yearOnly[1] }
    return null
  }
  const monthIdx = parseInt(m[2], 10) - 1
  if (monthIdx < 0 || monthIdx > 11) return null
  return { month: MONTH_NAMES[monthIdx], year: m[1] }
}

function cleanVariant(v?: string | null): string {
  if (!v) return ''
  const cleaned = v.trim()
  if (/^(none|n\/a|na|-)$/i.test(cleaned)) return ''
  return cleaned
}

function formatIssueNumber(num?: string | null): string {
  if (!num) return ''
  const n = num.toString().trim().replace(/^#/, '')
  if (!n || /^0+$/.test(n)) return ''
  return `#${n}`
}

function deduplicateParts(parts: string[]): string[] {
  const seen = new Set<string>()
  return parts.filter(p => {
    const key = p.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function safeStr(...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    if (v && typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export interface ComicPreviewInput {
  brand_title?: string | null
  subject?: string | null
  card_number?: string | null
  variant?: string | null
  year?: string | null
  grade?: string | null
  grading_company?: string | null
  psa_cert?: string | null
  catalog_snapshot?: Record<string, any> | null
  psa_snapshot?: Record<string, any> | null
  category?: string | null
  main_category?: string | null
}

export function isComicItem(item: ComicPreviewInput): boolean {
  return item.main_category === 'comics' || 
    (item.catalog_snapshot as any)?.type === 'graded_comic'
}

export function previewComicTitle(item: ComicPreviewInput): string {
  const snapshot = (item.catalog_snapshot || item.psa_snapshot || {}) as Record<string, any>

  const publisher = safeStr(snapshot.brandTitle, item.brand_title)
  const comicName = safeStr(snapshot.subject, item.subject)
  const issueNum = formatIssueNumber(snapshot.issueNumber || snapshot.cardNumber || item.card_number)
  const variant = cleanVariant(snapshot.varietyPedigree || item.variant)
  const pubDate = parsePublicationDate(snapshot.publicationDate || snapshot.year)

  const parts: string[] = []
  if (publisher) parts.push(publisher)
  if (comicName) parts.push(comicName)
  if (issueNum) parts.push(issueNum)
  if (pubDate) {
    if (pubDate.month) parts.push(pubDate.month)
    parts.push(pubDate.year)
  }
  if (variant) parts.push(variant)

  const deduped = deduplicateParts(parts.filter(Boolean))
  const raw = deduped.join(' ').toUpperCase()
  return raw.replace(/\s{2,}/g, ' ').trim() || 'GRADED COMIC'
}

export function previewComicDescription(item: ComicPreviewInput): string {
  const snapshot = (item.catalog_snapshot || item.psa_snapshot || {}) as Record<string, any>
  const gradingCompany = item.grading_company || 'PSA'
  const psaCert = safeStr(item.psa_cert)
  const grade = safeStr(item.grade)
  const publisher = safeStr(snapshot.brandTitle, item.brand_title)
  const comicName = safeStr(snapshot.subject, item.subject)
  const rawIssue = safeStr(snapshot.issueNumber, snapshot.cardNumber, item.card_number)
  const pubDate = safeStr(snapshot.publicationDate, snapshot.year, item.year)
  const variant = cleanVariant(snapshot.varietyPedigree || item.variant)
  const language = safeStr(snapshot.language)
  const country = safeStr(snapshot.country)
  const pageQuality = safeStr(snapshot.pageQuality)
  const category = safeStr(snapshot.category, item.category)

  const lines: string[] = []
  lines.push(`Graded Comic — ${gradingCompany}`)
  if (psaCert) lines.push(`Cert Number: ${psaCert}`)
  if (grade) lines.push(`Grade: ${gradingCompany} ${grade}`)
  if (comicName) lines.push(`Name: ${comicName}`)
  if (rawIssue) lines.push(`Issue: #${rawIssue.replace(/^#/, '')}`)
  if (pubDate) lines.push(`Publication Date: ${pubDate}`)
  if (publisher) lines.push(`Publisher: ${publisher}`)
  if (variant) lines.push(`Variant: ${variant}`)
  if (language && !/^english$/i.test(language)) lines.push(`Language: ${language}`)
  if (country) lines.push(`Country: ${country}`)
  if (pageQuality) lines.push(`Page Quality: ${pageQuality}`)
  if (category) lines.push(`Category: ${category}`)

  return lines.join('\n')
}
