import { z } from "./zod"

import { extractedDocumentSchema } from "./types"

export type RuntimeMessage =
  | {
      readonly type: "ANALYZE_DOCUMENT"
      readonly payload: z.infer<typeof extractedDocumentSchema>
    }
  | {
      readonly type: "MANUAL_MARK_READ"
      readonly payload: {
        readonly targetId: string
      }
    }
  | {
      readonly type: "REQUEST_SETTINGS"
    }
  | {
      readonly type: "REQUEST_WHITELIST_DOMAINS"
    }
  | {
      readonly type: "TEST_PROVIDER_CONNECTION"
      readonly payload: {
        readonly providerId: string
      }
    }
  | {
      readonly type: "REBUILD_EMBEDDINGS"
    }
  | {
      readonly type: "CHECK_DOCUMENT_URL_HISTORY"
      readonly payload: {
        readonly canonicalUrl: string
        readonly url: string
      }
    }
  | {
      readonly type: "GET_EXISTING_ANALYSIS_RESULT"
      readonly payload: {
        readonly canonicalUrl: string
        readonly url: string
      }
    }
  | {
      readonly type: "MARK_DOCUMENT_READ"
      readonly payload: {
        readonly canonicalUrl: string
        readonly url: string
      }
    }
  | {
      readonly type: "RUN_DOCUMENT_PRECHECK"
      readonly payload: {
        readonly canonicalUrl: string
        readonly compactText: string
        readonly url: string
      }
    }
  | {
      readonly type: "ENQUEUE_DOCUMENT_ANALYSIS"
      readonly payload: z.infer<typeof extractedDocumentSchema>
    }
  | {
      readonly type: "OPEN_SIDEPANEL"
    }
  | {
      readonly type: "GET_CONTENT_TAB_ID"
    }

export const runtimeMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ANALYZE_DOCUMENT"),
    payload: extractedDocumentSchema
  }),
  z.object({
    type: z.literal("MANUAL_MARK_READ"),
    payload: z.object({
      targetId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("REQUEST_SETTINGS")
  }),
  z.object({
    type: z.literal("REQUEST_WHITELIST_DOMAINS")
  }),
  z.object({
    type: z.literal("TEST_PROVIDER_CONNECTION"),
    payload: z.object({
      providerId: z.string().min(1)
    })
  }),
  z.object({
    type: z.literal("REBUILD_EMBEDDINGS")
  }),
  z.object({
    type: z.literal("CHECK_DOCUMENT_URL_HISTORY"),
    payload: z.object({
      canonicalUrl: z.string().url(),
      url: z.string().url()
    })
  }),
  z.object({
    type: z.literal("GET_EXISTING_ANALYSIS_RESULT"),
    payload: z.object({
      canonicalUrl: z.string().url(),
      url: z.string().url()
    })
  }),
  z.object({
    type: z.literal("MARK_DOCUMENT_READ"),
    payload: z.object({
      canonicalUrl: z.string().url(),
      url: z.string().url()
    })
  }),
  z.object({
    type: z.literal("RUN_DOCUMENT_PRECHECK"),
    payload: z.object({
      canonicalUrl: z.string().url(),
      compactText: z.string().min(1),
      url: z.string().url()
    })
  }),
  z.object({
    type: z.literal("ENQUEUE_DOCUMENT_ANALYSIS"),
    payload: extractedDocumentSchema
  }),
  z.object({
    type: z.literal("OPEN_SIDEPANEL")
  }),
  z.object({
    type: z.literal("GET_CONTENT_TAB_ID")
  })
])
