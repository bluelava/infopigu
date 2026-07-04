import type { DocumentRecord } from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"
import {
  canonicalizeUrl,
  createCanonicalUrlLookupVariants,
  extractDomainFromUrl
} from "../core/url"

function normalizeDocumentRecord(document: DocumentRecord): DocumentRecord {
  const normalizedCanonicalUrl = canonicalizeUrl(document.canonicalUrl)
  const normalizedUrl = canonicalizeUrl(document.url)

  return {
    ...document,
    url: normalizedUrl,
    canonicalUrl: normalizedCanonicalUrl,
    domain: extractDomainFromUrl(normalizedCanonicalUrl)
  }
}

export function createDocumentsRepository(database: CognitiveDeltaDb) {
  async function listByExactUrl(input: {
    readonly canonicalUrl: string
    readonly url: string
  }): Promise<readonly DocumentRecord[]> {
    const canonicalUrlVariants = [...new Set(createCanonicalUrlLookupVariants(input.canonicalUrl))]
    const urlVariants = [...new Set(createCanonicalUrlLookupVariants(input.url))]
    const [canonicalMatches, urlMatches] = await Promise.all([
      database.documents.where("canonicalUrl").anyOf(canonicalUrlVariants).toArray(),
      database.documents.where("url").anyOf(urlVariants).toArray()
    ])
    const normalizedLookupSet = new Set([
      canonicalizeUrl(input.canonicalUrl),
      canonicalizeUrl(input.url)
    ])
    const fallbackMatches =
      canonicalMatches.length > 0 || urlMatches.length > 0
        ? []
        : (await database.documents.toArray()).filter((document) => {
            const normalizedDocumentCanonicalUrl = canonicalizeUrl(document.canonicalUrl)
            const normalizedDocumentUrl = canonicalizeUrl(document.url)

            return (
              normalizedLookupSet.has(normalizedDocumentCanonicalUrl) ||
              normalizedLookupSet.has(normalizedDocumentUrl)
            )
          })
    const byDocId = new Map<DocumentRecord["docId"], DocumentRecord>()

    for (const document of [...canonicalMatches, ...urlMatches, ...fallbackMatches]) {
      const previous = byDocId.get(document.docId)

      if (
        previous === undefined ||
        document.savedAt > previous.savedAt ||
        document.readAt > previous.readAt
      ) {
        byDocId.set(document.docId, document)
      }
    }

    return [...byDocId.values()].sort((left, right) => {
      if (right.readAt !== left.readAt) {
        return right.readAt - left.readAt
      }

      return right.savedAt - left.savedAt
    })
  }

  return {
    async saveDocument(document: DocumentRecord): Promise<void> {
      await database.documents.put(normalizeDocumentRecord(document))
    },

    async countDocuments(): Promise<number> {
      return database.documents.count()
    },

    async getDocumentsByIds(docIds: readonly DocumentRecord["docId"][]): Promise<readonly DocumentRecord[]> {
      return database.documents.bulkGet([...docIds]).then((records) =>
        records.filter((record): record is DocumentRecord => record !== undefined)
      )
    },

    async findByExactUrl(input: {
      readonly canonicalUrl: string
      readonly url: string
    }): Promise<DocumentRecord | undefined> {
      return (await listByExactUrl(input))[0]
    },

    listByExactUrl,

    async listDocuments(): Promise<readonly DocumentRecord[]> {
      return database.documents.orderBy("savedAt").toArray()
    },

    async listPersistedDocuments(): Promise<readonly DocumentRecord[]> {
      return database.documents
        .orderBy("savedAt")
        .reverse()
        .filter((document) => document.savedAt > 0 && document.status !== "deleted")
        .toArray()
    }
  }
}
