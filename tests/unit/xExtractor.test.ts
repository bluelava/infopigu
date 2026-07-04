// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import {
  extractXArticleDocumentFromPage,
  extractXFeedDocumentFromElement
} from "../../src/content/extractors/xExtractor"
import { classifyPageKind } from "../../src/content/pageKind"

describe("x extractor", () => {
  it("extracts the single-post body from og:description metadata", () => {
    document.head.innerHTML = `
      <meta property="og:description" content="RepoPrompt 作者被 OpenAI 招安了，然后这软件现在免费了，即将开源。" />
    `
    document.body.innerHTML = `<main></main>`

    const extracted = extractXArticleDocumentFromPage({
      root: document,
      url: "https://x.com/dotey/status/2059729329119006928"
    })

    expect(extracted?.extractor).toBe("x-article")
    expect(extracted?.domain).toBe("x.com")
    expect(extracted?.blocks[0]?.text).toContain("RepoPrompt 作者被 OpenAI 招安了")
  })

  it("extracts feed cards into feed-item documents with the status permalink", () => {
    document.body.innerHTML = `
      <article data-tweet-id="2059729329119006928">
        <div dir="auto">RepoPrompt 作者被 OpenAI 招安了，然后这软件现在免费了，即将开源。</div>
        <a href="/dotey/status/2059729329119006928">May 27</a>
      </article>
    `

    const element = document.querySelector("article")
    const extracted = element === null ? null : extractXFeedDocumentFromElement(element)

    expect(extracted?.extractor).toBe("feed-item")
    expect(extracted?.url).toContain("/dotey/status/2059729329119006928")
    expect(extracted?.blocks[0]?.text).toContain("RepoPrompt 作者被 OpenAI 招安了")
  })

  it("classifies x profile pages with status-card wrappers even without data-tweet-id", () => {
    document.body.innerHTML = `
      <main>
        <div data-href="/dotey/status/2059729329119006928" role="link" tabindex="0">
          <div data-testid="tweetText">
            <span>${"这是一条登录态时间线正文".repeat(8)}</span>
          </div>
        </div>
      </main>
    `

    expect(classifyPageKind(new URL("https://x.com/dotey"), document)).toBe("x-feed")
  })

  it("extracts feed cards from wrapper links that use data-href and div[lang]", () => {
    document.body.innerHTML = `
      <div data-href="/dotey/status/2059729329119006928" role="link" tabindex="0">
        <article>
          <div lang="zh-CN">${"这是另一条时间线正文".repeat(8)}</div>
        </article>
      </div>
    `

    const wrapper = document.querySelector("[data-href]")
    const extracted = wrapper === null ? null : extractXFeedDocumentFromElement(wrapper)

    expect(extracted?.extractor).toBe("feed-item")
    expect(extracted?.url).toContain("/dotey/status/2059729329119006928")
    expect(extracted?.blocks[0]?.text).toContain("这是另一条时间线正文")
  })
})
