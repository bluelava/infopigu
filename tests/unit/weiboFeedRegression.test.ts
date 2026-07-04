// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import {
  extractFeedDocumentFromElement,
  findWeiboFeedItemsFromMutations,
  findFeedItemElements
} from "../../src/content/extractors/weiboExtractor"

describe("weibo feed regression", () => {
  it("still finds multiple readable feed items on the home feed surface", () => {
    document.body.innerHTML = `
      <main data-surface="home-feed">
        <article role="article">
          <header><span>关注</span></header>
          <p>${"首页卡片一".repeat(50)}</p>
          <a href="/123456/R6home001">刚刚</a>
        </article>
        <article role="article">
          <header><span>私信</span></header>
          <p>${"首页卡片二".repeat(50)}</p>
          <a href="/123456/R6home002">刚刚</a>
        </article>
      </main>
    `

    expect(findFeedItemElements()).toHaveLength(2)
  })

  it("still finds multiple readable feed items on the grouped feed surface", () => {
    document.body.innerHTML = `
      <section data-surface="grouped-feed">
        <div role="article">
          <span>${"分组卡片一".repeat(50)}</span>
          <span>展开</span>
          <a href="/123456/R6group001">刚刚</a>
        </div>
        <div role="article">
          <span>${"分组卡片二".repeat(50)}</span>
          <span>热议</span>
          <a href="/123456/R6group002">刚刚</a>
        </div>
      </section>
    `

    expect(findFeedItemElements()).toHaveLength(2)
  })

  it("still finds multiple readable feed items on the creator timeline surface", () => {
    document.body.innerHTML = `
      <section data-surface="creator-feed">
        <article>
          <blockquote>${"博主卡片一".repeat(50)}</blockquote>
          <span>评论</span>
          <a href="/123456/R6creator001">刚刚</a>
        </article>
        <article>
          <blockquote>${"博主卡片二".repeat(50)}</blockquote>
          <span>推荐</span>
          <a href="/123456/R6creator002">刚刚</a>
        </article>
      </section>
    `

    expect(findFeedItemElements()).toHaveLength(2)
  })

  it("extracts feed items as text-only blocks without shell text", () => {
    document.body.innerHTML = `
      <article role="article">
        <div class="_wbtext_velez_14">
          <p>${"正文".repeat(50)}</p>
        </div>
        <div class="time_1tpft_33">
          <a href="https://weibo.com/123456/abcdef">2分钟前</a>
        </div>
        <span>评论</span>
        <span>推荐</span>
      </article>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe("https://weibo.com/123456/abcdef")
    expect(extracted?.blocks.some((block) => block.text === "评论")).toBe(false)
    expect(extracted?.blocks.some((block) => block.text === "推荐")).toBe(false)
  })

  it("uses wbtext content as the only feed body source", () => {
    document.body.innerHTML = `
      <article role="article">
        <div class="_wbtext_velez_14">
          <p>${"这是正文".repeat(40)}</p>
        </div>
        <div class="time_1tpft_33">
          <a href="https://weibo.com/123456/onlybody">刚刚</a>
        </div>
        <div>${"外围噪音".repeat(40)}</div>
      </article>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(extracted?.blocks.some((block) => block.text.includes("这是正文"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("外围噪音"))).toBe(false)
  })

  it("extracts feed content from generic readable card markup when wbtext-specific classes are absent", () => {
    document.body.innerHTML = `
      <article role="article">
        <div data-testid="detail-content">
          <span>${"通用卡片正文".repeat(40)}</span>
        </div>
        <footer>
          <a href="https://weibo.com/654321/genericfeed">查看详情</a>
          <span>评论</span>
          <span>推荐</span>
        </footer>
      </article>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe("https://weibo.com/654321/genericfeed")
    expect(extracted?.blocks.some((block) => block.text.includes("通用卡片正文"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text === "评论")).toBe(false)
    expect(extracted?.blocks.some((block) => block.text === "推荐")).toBe(false)
  })

  it("prefers the feed permalink inside the time element over the profile homepage link", () => {
    document.body.innerHTML = `
      <article role="article">
        <header>
          <a href="https://weibo.com/u/6105713761">博主首页</a>
        </header>
        <div class="_wbtext_velez_14">
          <p>${"帖子正文".repeat(40)}</p>
        </div>
        <div class="_time_1tpft_33">
          <a href="https://weibo.com/1402400261/R4ct4n6tX?pagetype=profilefeed">刚刚</a>
        </div>
      </article>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe("https://weibo.com/1402400261/R4ct4n6tX?pagetype=profilefeed")
    expect(extracted?.url).not.toBe("https://weibo.com/u/6105713761")
  })

  it("extracts legacy feed cards with mid markers and relative permalinks", () => {
    document.body.innerHTML = `
      <div class="card-wrap" mid="1234567890">
        <div node-type="feed_list_content_full">这是一条较短但有效的微博 feeds 正文。</div>
        <div class="time_1tpft_33">
          <a href="/1234567890/R6fdT01VI?from=page_1005051234567890_profile">刚刚</a>
        </div>
      </div>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(element).not.toBeUndefined()
    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe(
      "https://weibo.com/1234567890/R6fdT01VI?from=page_1005051234567890_profile"
    )
    expect(extracted?.blocks[0]?.text).toContain("较短但有效的微博 feeds 正文")
  })

  it("finds and extracts classic feed cards by their detail permalink even without article-like shell selectors", () => {
    document.body.innerHTML = `
      <div class="WB_feed_type">
        <div class="WB_text W_f14">
          <div>${"经典 feeds 正文第一段".repeat(10)}</div>
          <div>${"经典 feeds 正文第二段".repeat(10)}</div>
        </div>
        <div class="WB_from">
          <a href="/2194035935/R6jFpmsGI?from=page_1005052194035935_profile">刚刚</a>
        </div>
      </div>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(element).not.toBeUndefined()
    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe("https://weibo.com/2194035935/R6jFpmsGI?from=page_1005052194035935_profile")
    expect(extracted?.blocks.some((block) => block.text.includes("经典 feeds 正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("经典 feeds 正文第二段"))).toBe(true)
  })

  it("finds feed cards on the logged-in weibo home timeline root path", () => {
    document.body.innerHTML = `
      <main data-surface="logged-in-home">
        <div class="WB_feed_type">
          <div class="WB_text W_f14">${"登录首页第一条微博正文".repeat(8)}</div>
          <div class="WB_from">
            <a href="/2194035935/R6jFpmsGI">刚刚</a>
          </div>
        </div>
      </main>
    `

    const items = findFeedItemElements()
    const extracted = items[0] === undefined ? null : extractFeedDocumentFromElement(items[0])

    expect(items).toHaveLength(1)
    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe("https://weibo.com/2194035935/R6jFpmsGI")
    expect(extracted?.blocks.some((block) => block.text.includes("登录首页第一条微博正文"))).toBe(true)
  })

  it("ignores non-post weibo cards that only contain profile links and no detail permalink", () => {
    document.body.innerHTML = `
      <main data-surface="logged-in-home">
        <div class="WB_feed_type">
          <div class="WB_text W_f14">${"推荐关注卡片文案".repeat(8)}</div>
          <div class="WB_from">
            <a href="/u/1639498782">查看主页</a>
          </div>
        </div>
        <div class="WB_feed_type">
          <div class="WB_text W_f14">${"真正的微博正文内容".repeat(8)}</div>
          <div class="WB_from">
            <a href="/2194035935/R6jFpmsGI">刚刚</a>
          </div>
        </div>
      </main>
    `

    const items = findFeedItemElements()
    const extracted = items[0] === undefined ? null : extractFeedDocumentFromElement(items[0])

    expect(items).toHaveLength(1)
    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe("https://weibo.com/2194035935/R6jFpmsGI")
    expect(extracted?.blocks.some((block) => block.text.includes("真正的微博正文内容"))).toBe(true)
  })

  it("climbs past generic time wrappers and extracts the enclosing feed card on modern feed markup", () => {
    document.body.innerHTML = `
      <main data-surface="logged-in-home">
        <div class="feed-shell">
          <div class="content-shell">
            <div class="_wbtext_modern_21">
              <span>${"这是新版 feed 正文第一段".repeat(8)}</span>
              <span>${"这是新版 feed 正文第二段".repeat(8)}</span>
            </div>
            <div class="meta-shell">
              <a href="/2194035935/R6jFpmsGI?from=page_1005052194035935_profile">刚刚 来自 iPhone 16 Pro</a>
            </div>
          </div>
        </div>
      </main>
    `

    const items = findFeedItemElements()
    const extracted = items[0] === undefined ? null : extractFeedDocumentFromElement(items[0])

    expect(items).toHaveLength(1)
    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe("https://weibo.com/2194035935/R6jFpmsGI?from=page_1005052194035935_profile")
    expect(extracted?.blocks.some((block) => block.text.includes("新版 feed 正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("新版 feed 正文第二段"))).toBe(true)
  })

  it("filters video-player accessibility modal noise out of feed extraction", () => {
    document.body.innerHTML = `
      <article role="article">
        <div class="_wbtext_video_21">
          <span>${"真实微博正文第一段".repeat(10)}</span>
          <span>
            Video Player is loading. Loaded 0% Current Time 00:00 / Duration 00:00
            This is a modal window. Beginning of dialog window. Escape will cancel and close the window.
            Font Size50%75%100%125%150%175%200%300%400%
            Text Edge StyleNoneRaisedDepressedUniformDrop shadow
            Font FamilyProportional Sans-SerifMonospace Sans-SerifProportional SerifMonospace SerifCasualScriptSmall Caps
            ResetDone Close Modal Dialog End of dialog window. 按住画面可移动小窗。
          </span>
          <span>${"真实微博正文第二段".repeat(10)}</span>
        </div>
        <div class="time_1tpft_33">
          <a href="https://weibo.com/123456/R6fdT01VI">刚刚</a>
        </div>
      </article>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks.some((block) => block.text.includes("真实微博正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("真实微博正文第二段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("Video Player is loading"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("Close Modal Dialog"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("按住画面可移动小窗"))).toBe(false)
  })

  it("strips video-player modal noise even when it is concatenated into the same feed body block", () => {
    document.body.innerHTML = `
      <article role="article">
        <div class="_wbtext_video_mixed_21">
          <span>
            ${"真实微博正文混合第一段".repeat(8)}
            Video Player is loading. Loaded 0% Current Time 00:00 / Duration 00:00
            This is a modal window. Beginning of dialog window. Escape will cancel and close the window.
            ResetDone Close Modal Dialog End of dialog window. 按住画面可移动小窗。
            ${"真实微博正文混合第二段".repeat(8)}
          </span>
        </div>
        <div class="time_1tpft_33">
          <a href="https://weibo.com/123456/R6fdT01VI?pagetype=homefeed">刚刚</a>
        </div>
      </article>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks.some((block) => block.text.includes("真实微博正文混合第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("真实微博正文混合第二段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("Video Player is loading"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("Close Modal Dialog"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("按住画面可移动小窗"))).toBe(false)
  })

  it("prefers the real feed text root over an earlier video-player lang node", () => {
    document.body.innerHTML = `
      <article role="article">
        <div lang="en">
          Video Player is loading. Loaded 0% Current Time 00:00 / Duration 00:00
          This is a modal window. Beginning of dialog window. Escape will cancel and close the window.
          ResetDone Close Modal Dialog End of dialog window.
        </div>
        <div class="_wbtext_real_feed_21">
          <span>${"真正的 feed 正文第一段".repeat(8)}</span>
          <span>${"真正的 feed 正文第二段".repeat(8)}</span>
        </div>
        <div class="time_1tpft_33">
          <a href="https://weibo.com/2694995107/R6RfMl9oD?pagetype=homefeed">刚刚</a>
        </div>
      </article>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks.some((block) => block.text.includes("真正的 feed 正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("真正的 feed 正文第二段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("Video Player is loading"))).toBe(false)
  })

  it("filters split video-player accessibility fragments and keeps only the feed正文", () => {
    document.body.innerHTML = `
      <article role="article">
        <div class="_wbtext_real_feed_21">
          <span>${"真实 feed 正文第一段".repeat(8)}</span>
          <span>Video Player is loading.</span>
          <span>Loaded 0%</span>
          <span>Current Time 00:00 / Duration 00:00</span>
          <span>This is a modal window.</span>
          <span>Beginning of dialog window.</span>
          <span>Escape will cancel and close the window.</span>
          <span>ResetDone Close Modal Dialog End of dialog window.</span>
          <span>按住画面可移动小窗。</span>
          <span>${"真实 feed 正文第二段".repeat(8)}</span>
        </div>
        <div class="time_1tpft_33">
          <a href="https://weibo.com/7782884695/R6Scqe7Zc?pagetype=homefeed">刚刚</a>
        </div>
      </article>
    `

    const element = findFeedItemElements()[0]
    const extracted = element === undefined ? null : extractFeedDocumentFromElement(element)
    const combinedText = extracted?.blocks.map((block) => block.text).join(" ") ?? ""

    expect(extracted).not.toBeNull()
    expect(combinedText).toContain("真实 feed 正文第一段")
    expect(combinedText).toContain("真实 feed 正文第二段")
    expect(combinedText).not.toContain("Video Player is loading")
    expect(combinedText).not.toContain("Loaded 0%")
    expect(combinedText).not.toContain("Current Time 00:00 / Duration 00:00")
    expect(combinedText).not.toContain("This is a modal window")
    expect(combinedText).not.toContain("Escape will cancel and close the window")
    expect(combinedText).not.toContain("Close Modal Dialog")
    expect(combinedText).not.toContain("按住画面可移动小窗")
  })

  it("extracts a modern feed card when the detail permalink lives on a data-href wrapper instead of a time anchor", () => {
    document.body.innerHTML = `
      <main data-surface="logged-in-home">
        <div class="feed-shell" data-href="/2694995107/R6RfMl9oD?pagetype=homefeed" role="link" tabindex="0">
          <div class="_wbtext_modern_21">
            <span>${"这是 data-href feed 正文第一段".repeat(8)}</span>
            <span>${"这是 data-href feed 正文第二段".repeat(8)}</span>
          </div>
          <div class="meta-shell">
            <span>刚刚 来自网页版</span>
          </div>
        </div>
      </main>
    `

    const items = findFeedItemElements()
    const extracted = items[0] === undefined ? null : extractFeedDocumentFromElement(items[0])

    expect(items).toHaveLength(1)
    expect(extracted).not.toBeNull()
    expect(extracted?.url).toBe("https://weibo.com/2694995107/R6RfMl9oD?pagetype=homefeed")
    expect(extracted?.blocks.some((block) => block.text.includes("data-href feed 正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("data-href feed 正文第二段"))).toBe(true)
  })

  it("does not register a half-hydrated mutation card until its permalink is available", () => {
    const article = document.createElement("article")
    article.setAttribute("role", "article")
    article.innerHTML = `
      <div class="_wbtext_pending_21">
        <span>${"这是尚未挂上链接的微博正文".repeat(8)}</span>
      </div>
    `

    const records = [
      {
        addedNodes: [article] as unknown as NodeList,
        attributeName: null,
        oldValue: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: document.body,
        type: "childList"
      } as unknown as MutationRecord
    ]

    expect(findWeiboFeedItemsFromMutations(records)).toHaveLength(0)
  })
})
