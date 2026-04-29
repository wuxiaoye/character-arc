import type { InspirationEntry } from '@/types/app'

type ChapterContextLike = {
  title?: string
  summary?: string
  content?: string
}

function tokenizeSource(text: string): string[] {
  if (!text.trim()) {
    return []
  }

  const rawTokens = text
    .split(/[\s,，。.!！？?；;：:、/\\|(){}（）【】《》"'“”‘’\r\n\t\-\[\]]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

  return rawTokens.flatMap((token) => {
    if (token.length <= 6) {
      return [token]
    }

    return [token, token.slice(0, 4), token.slice(-4)]
  })
}

function buildContextTokens(chapter: ChapterContextLike): string[] {
  return Array.from(
    new Set(
      [chapter.title ?? '', chapter.summary ?? '', chapter.content ?? '']
        .flatMap((text) => tokenizeSource(text))
        .filter(Boolean)
    )
  ).slice(0, 40)
}

function computeInspirationScore(entry: InspirationEntry, chapter: ChapterContextLike, contextTokens: string[]): number {
  const haystack = `${entry.type} ${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase()
  const chapterHaystack = `${chapter.title ?? ''} ${chapter.summary ?? ''} ${chapter.content ?? ''}`.toLowerCase()
  let score = Math.max(0, 6 - entry.sortOrder)

  for (const token of contextTokens) {
    const normalizedToken = token.toLowerCase()
    if (normalizedToken.length < 2) {
      continue
    }

    if (haystack.includes(normalizedToken)) {
      score += normalizedToken.length >= 4 ? 7 : 4
      continue
    }

    if (chapterHaystack.includes(normalizedToken) && entry.tags.some((tag) => normalizedToken.includes(tag.toLowerCase()))) {
      score += 3
    }
  }

  const title = entry.title.trim().toLowerCase()
  if (title && chapterHaystack.includes(title)) {
    score += 10
  }

  return score
}

export function pickRelevantInspirationEntries(
  entries: InspirationEntry[],
  chapter: ChapterContextLike,
  limit = 4
): InspirationEntry[] {
  if (!entries.length) {
    return []
  }

  const contextTokens = buildContextTokens(chapter)
  const rankedEntries = entries
    .map((entry) => ({
      entry,
      score: computeInspirationScore(entry, chapter, contextTokens),
      updatedAt: Date.parse(entry.updatedAt || '')
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return (right.updatedAt || 0) - (left.updatedAt || 0)
    })

  const positiveEntries = rankedEntries.filter((item) => item.score > 0).map((item) => item.entry)
  if (positiveEntries.length > 0) {
    return positiveEntries.slice(0, limit)
  }

  return [...entries]
    .sort((left, right) => {
      const rightTime = Date.parse(right.updatedAt || '')
      const leftTime = Date.parse(left.updatedAt || '')
      return (rightTime || 0) - (leftTime || 0)
    })
    .slice(0, limit)
}
