// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { classifyPageKind } from "../../src/content/pageKind"

describe("classifyPageKind", () => {
  it("classifies weibo home as a feed page even when only one readable card is hydrated initially", () => {
    document.body.innerHTML = `
      <main data-surface="home-feed">
        <article role="article">
          <p>${"首页第一条微博正文".repeat(12)}</p>
          <span>评论</span>
          <span>推荐</span>
        </article>
      </main>
    `

    expect(classifyPageKind(new URL("https://weibo.com/"), document)).toBe("weibo-feed")
  })

  it("classifies logged-in weibo home root with classic WB feed cards as a feed page", () => {
    document.body.innerHTML = `
      <main>
        <div class="WB_feed_type">
          <div class="WB_text W_f14">${"登录首页微博正文".repeat(8)}</div>
          <a href="/2194035935/R6jFpmsGI">刚刚</a>
        </div>
      </main>
    `

    expect(classifyPageKind(new URL("https://weibo.com/"), document)).toBe("weibo-feed")
  })

  it("keeps the logged-in weibo home root on the feed path before feed cards hydrate", () => {
    document.body.innerHTML = `
      <main>
        <div class="WB_main_r">${"首页骨架占位".repeat(8)}</div>
      </main>
    `

    expect(classifyPageKind(new URL("https://weibo.com/"), document)).toBe("weibo-feed")
  })

  it("short-circuits known weibo feed paths before running expensive article DOM scans", () => {
    const originalQuerySelectorAll = document.querySelectorAll.bind(document)
    const querySelectorAllSpy = vi.fn((selectors: string) => {
      if (selectors.includes(".WB_detail") || selectors.includes("[class*='detail_wbtext']")) {
        throw new Error("should not scan article selectors on known feed paths")
      }

      return originalQuerySelectorAll(selectors)
    })
    document.body.innerHTML = `
      <main>
        <div class="WB_main_r">${"首页骨架占位".repeat(8)}</div>
      </main>
    `
    document.querySelectorAll = querySelectorAllSpy as typeof document.querySelectorAll

    try {
      expect(classifyPageKind(new URL("https://weibo.com/"), document)).toBe("weibo-feed")
    } finally {
      document.querySelectorAll = originalQuerySelectorAll as typeof document.querySelectorAll
    }
  })

  it("keeps weibo u-profile pages on the feed path before feed cards hydrate", () => {
    document.body.innerHTML = `
      <main>
        <div class="WB_frame">${"博主主页骨架占位".repeat(8)}</div>
      </main>
    `

    expect(classifyPageKind(new URL("https://weibo.com/u/1639498782"), document)).toBe("weibo-feed")
  })

  it("classifies a short weibo detail page as an article when a legacy detail body exists", () => {
    document.body.innerHTML = `
      <main>
        <div node-type="feed_list_content_full">这是一条较短但有效的微博正文。</div>
      </main>
    `

    expect(classifyPageKind(new URL("https://weibo.com/1234567890/R6fdT01VI"), document)).toBe(
      "weibo-article"
    )
  })

  it("classifies weibo numeric profile pages with cards as feed pages", () => {
    document.body.innerHTML = `
      <main>
        <div class="WB_feed_type">
          <div class="WB_text W_f14">${"博主主页第一条微博".repeat(8)}</div>
          <a href="/2194035935/R6jFpmsGI">刚刚</a>
        </div>
      </main>
    `

    expect(classifyPageKind(new URL("https://weibo.com/2194035935"), document)).toBe("weibo-feed")
  })

  it("classifies weibo slug profile pages with cards as feed pages", () => {
    document.body.innerHTML = `
      <main>
        <div class="WB_feed_type">
          <div class="WB_text W_f14">${"博主主页第二条微博".repeat(8)}</div>
          <a href="/2194035935/R6jFpmsGI">刚刚</a>
        </div>
      </main>
    `

    expect(classifyPageKind(new URL("https://weibo.com/dotey"), document)).toBe("weibo-feed")
  })

  it("classifies x status urls as single-article pages", () => {
    document.body.innerHTML = `
      <main>
        <article data-tweet-id="2059729329119006928">
          <div dir="auto">RepoPrompt 作者被 OpenAI 招安了，然后这软件现在免费了，即将开源。</div>
        </article>
      </main>
    `

    expect(
      classifyPageKind(new URL("https://x.com/dotey/status/2059729329119006928"), document)
    ).toBe("x-article")
  })

  it("classifies x profile pages with tweets as feed pages", () => {
    document.body.innerHTML = `
      <main>
        <article data-tweet-id="2059729329119006928">
          <div dir="auto">${"第一条推文正文".repeat(6)}</div>
          <a href="/dotey/status/2059729329119006928">May 27</a>
        </article>
        <article data-tweet-id="2059729329119006929">
          <div dir="auto">${"第二条推文正文".repeat(6)}</div>
          <a href="/dotey/status/2059729329119006929">May 28</a>
        </article>
      </main>
    `

    expect(classifyPageKind(new URL("https://x.com/dotey"), document)).toBe("x-feed")
  })

  it("classifies x home as a feed page when tweet cards are present", () => {
    document.body.innerHTML = `
      <main>
        <article data-tweet-id="2059729329119006930">
          <div dir="auto">${"首页第一条正文".repeat(6)}</div>
          <a href="/somebody/status/2059729329119006930">May 29</a>
        </article>
      </main>
    `

    expect(classifyPageKind(new URL("https://x.com/home"), document)).toBe("x-feed")
  })

  it("classifies arxiv abs pages as supported but keeps other arxiv pages unsupported", () => {
    document.body.innerHTML = `
      <main>
        <blockquote class="abstract mathjax">Abstract: Agent systems coordinate over long horizons.</blockquote>
      </main>
    `

    expect(classifyPageKind(new URL("https://arxiv.org/abs/2607.02480"), document)).toBe("arxiv-article")
    expect(classifyPageKind(new URL("https://arxiv.org/pdf/2607.02480"), document)).toBe("unsupported")
  })

  it("classifies github repository home pages as supported but keeps other github pages unsupported", () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="repo-about-description">Repository about text.</div>
        <section id="readme"><article><p>Readme intro.</p></article></section>
      </main>
    `

    expect(classifyPageKind(new URL("https://github.com/0xNyk/council-of-high-intelligence"), document)).toBe(
      "github-repo"
    )
    expect(
      classifyPageKind(new URL("https://github.com/0xNyk/council-of-high-intelligence/pulls"), document)
    ).toBe("unsupported")
  })
})
