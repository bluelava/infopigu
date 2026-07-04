import type { ExtractedDocument } from "../../../shared/types"

import { collectTextBlocks, createExtractedDocument } from "../../extractors/helpers"

const ignoredPatterns = [
  "推荐阅读",
  "商务合作",
  "合作热线",
  "投诉电话",
  "客服电话",
  "扫码",
  "广告",
  "版权声明",
  "版权所有",
  "copyright",
  "2009年至2026年"
] as const

function shouldKeepWechatNode(text: string): boolean {
  const normalizedText = text.toLowerCase()

  return !ignoredPatterns.some((pattern) => normalizedText.includes(pattern.toLowerCase()))
}

function isWechatTailSectionText(text: string): boolean {
  const normalizedText = text.toLowerCase()

  return ignoredPatterns.some((pattern) => normalizedText.includes(pattern.toLowerCase()))
}

export function classifyWechatPageKind(url: URL, root: Document): "wechat-article" | null {
  if (url.hostname.replace(/^www\./u, "") !== "mp.weixin.qq.com") {
    return null
  }

  return root.querySelector("#activity-name") !== null && root.querySelector("#js_content") !== null
    ? "wechat-article"
    : null
}

export function extractWechatDocument(): ExtractedDocument | null {
  const title = document.querySelector("#activity-name")?.textContent?.trim()
  const contentRoot = document.querySelector("#js_content")

  if (title === undefined || title.length === 0 || contentRoot === null) {
    return null
  }

  const authorText = document.querySelector("#js_name")?.textContent?.trim()
  const blocks = []

  for (const block of collectTextBlocks([...contentRoot.querySelectorAll("h2, h3, p, li, blockquote")])) {
    if (!shouldKeepWechatNode(block.text)) {
      if (isWechatTailSectionText(block.text)) {
        break
      }

      continue
    }

    blocks.push(block)
  }

  if (blocks.length === 0) {
    return null
  }

  return createExtractedDocument({
    title,
    blocks,
    extractor: "wechat",
    url: window.location.href,
    ...(authorText === undefined || authorText.length === 0 ? {} : { author: authorText })
  })
}
