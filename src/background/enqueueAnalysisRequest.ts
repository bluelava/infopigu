import type { AnalysisJobRecord, ExtractedDocument } from "../shared/types"

export async function resolveEnqueueAnalysisRequest(input: {
  readonly checkDocumentUrlHistory: (payload: {
    readonly canonicalUrl: string
    readonly url: string
  }) => Promise<
    | {
        readonly duplicateScore: number
        readonly kind: "already-read"
      }
    | null
  >
  readonly document: ExtractedDocument
  readonly findExecutableJobByExactUrl: (payload: {
    readonly canonicalUrl: string
    readonly url: string
  }) => Promise<AnalysisJobRecord | undefined>
}): Promise<
  | { readonly kind: "skip-existing-document" }
  | { readonly kind: "reuse-existing-job"; readonly job: AnalysisJobRecord }
  | { readonly kind: "enqueue-new-job" }
> {
  const existingDocument = await input.checkDocumentUrlHistory({
    canonicalUrl: input.document.canonicalUrl,
    url: input.document.url
  })

  if (existingDocument !== null) {
    return {
      kind: "skip-existing-document"
    }
  }

  const existingJob = await input.findExecutableJobByExactUrl({
    canonicalUrl: input.document.canonicalUrl,
    url: input.document.url
  })

  if (existingJob !== undefined) {
    return {
      kind: "reuse-existing-job",
      job: existingJob
    }
  }

  return {
    kind: "enqueue-new-job"
  }
}
