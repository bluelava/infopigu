// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { extractWeiboArticleDocumentFromPage } from "../../src/content/extractors/weiboExtractor"

describe("extractWeiboArticleDocumentFromPage", () => {
  it("extracts title and text-only body blocks from a longform page", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h1>长文标题</h1>
          <p>${"正文段落".repeat(60)}</p>
          <img alt="cover" src="/cover.jpg" />
          <video controls></video>
        </article>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/ttarticle/p/show?id=2309405307472499048483"
    })

    expect(extracted?.title).toBe("长文标题")
    expect(extracted?.extractor).toBe("weibo-article")
    expect(extracted?.blocks.some((block) => block.text.includes("正文段落"))).toBe(true)
    expect(extracted?.blocks.every((block) => !block.text.includes("cover"))).toBe(true)
  })

  it("filters standalone action text from a detail page", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h1>详情页标题</h1>
          <p>${"详情正文".repeat(50)}</p>
          <span>转发</span>
          <span>评论</span>
          <span>赞</span>
          <span>关注</span>
        </article>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/1233486457/R2psYmPIp?pagetype=homefeed"
    })

    expect(extracted?.blocks.some((block) => block.text === "转发")).toBe(false)
    expect(extracted?.blocks.some((block) => block.text === "评论")).toBe(false)
    expect(extracted?.blocks.some((block) => block.text === "赞")).toBe(false)
    expect(extracted?.blocks.some((block) => block.text === "关注")).toBe(false)
  })

  it("filters author, publish-time, and client-source metadata from article body blocks", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h1>详情页标题</h1>
          <p>${"详情正文".repeat(50)}</p>
          <p>作者：张三</p>
          <p>发布时间：2026-06-30 10:00</p>
          <p>来自 iPhone 16 Pro</p>
        </article>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/1233486457/R2psYmPIp?pagetype=homefeed"
    })

    expect(extracted?.blocks.some((block) => block.text.includes("详情正文"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("作者：张三"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("发布时间"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("来自 iPhone"))).toBe(false)
  })

  it("drops hotline, complaint, and copyright footer text from article extraction", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h1>详情页标题</h1>
          <p>${"详情正文".repeat(50)}</p>
          <p>合作热线号码为4000-980-980。</p>
          <p>违规投诉电话为010-60618076。</p>
          <p>版权所有年份范围是2009年至2026年。</p>
        </article>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/1233486457/R2psYmPIp?pagetype=homefeed"
    })

    expect(extracted?.blocks.some((block) => block.text.includes("4000-980-980"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("010-60618076"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("2009年至2026年"))).toBe(false)
  })

  it("keeps only the main article blocks before the footer section", () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h1>详情页标题</h1>
          <p>${"第一段正文".repeat(30)}</p>
          <p>${"第二段正文".repeat(30)}</p>
          <p>合作热线号码为4000-980-980。</p>
          <p>${"不应继续提取的尾部区域".repeat(20)}</p>
        </article>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/1233486457/R2psYmPIp?pagetype=homefeed"
    })

    expect(extracted?.blocks.some((block) => block.text.includes("第一段正文"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("第二段正文"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("尾部区域"))).toBe(false)
  })

  it("returns null when no coherent readable article body exists", () => {
    document.body.innerHTML = `<main><button>转发</button><button>评论</button></main>`

    expect(
      extractWeiboArticleDocumentFromPage({
        root: document,
        url: "https://weibo.com/1233486457/R2psYmPIp?pagetype=homefeed"
      })
    ).toBeNull()
  })

  it("extracts only article body text and skips surrounding wbtext helper content", () => {
    document.body.innerHTML = `
      <main>
        <section class="_wbtext_velez_14">
          <span>${"外围说明文案".repeat(30)}</span>
        </section>
        <article>
          <h1>详情页标题</h1>
          <div class="article-content">
            <p>${"真正正文第一段".repeat(30)}</p>
            <p>${"真正正文第二段".repeat(30)}</p>
          </div>
        </article>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/1233486457/R2psYmPIp?pagetype=homefeed"
    })

    expect(extracted?.blocks.some((block) => block.text.includes("真正正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("真正正文第二段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("外围说明文案"))).toBe(false)
  })

  it("extracts a weibo detail page directly from wbtext body blocks", () => {
    document.body.innerHTML = `
      <main>
        <section class="_wbtext_velez_14">
          <span>${"详情正文第一段".repeat(40)}</span>
          <span>${"详情正文第二段".repeat(40)}</span>
        </section>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/2322312760/R3jAIDUKR?pagetype=homefeed"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks.some((block) => block.text.includes("详情正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("详情正文第二段"))).toBe(true)
  })

  it("extracts a shorter legacy detail body from node-type content", () => {
    document.body.innerHTML = `
      <main>
        <div node-type="feed_list_content_full">这是一条较短但有效的微博正文，应该继续被识别。</div>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/1234567890/R6fdT01VI"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.extractor).toBe("weibo-article")
    expect(extracted?.blocks[0]?.text).toContain("较短但有效的微博正文")
  })

  it("extracts span-based detail content from the main article container", () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="primary-post">
          <span>${"这是微博正文第一段".repeat(10)}</span>
          <span>${"这是微博正文第二段".repeat(10)}</span>
          <span>来自 iPhone 16 Pro</span>
        </article>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/2194035935/R6jFpmsGI"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks.some((block) => block.text.includes("微博正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("微博正文第二段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("来自 iPhone"))).toBe(false)
  })

  it("extracts classic WB_text article bodies from older weibo detail markup", () => {
    document.body.innerHTML = `
      <main>
        <div class="WB_detail">
          <div class="WB_text W_f14">
            <div>${"经典微博正文第一段".repeat(10)}</div>
            <div>${"经典微博正文第二段".repeat(10)}</div>
            <div>来自 微博网页版</div>
          </div>
        </div>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/2194035935/R6jFpmsGI"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks.some((block) => block.text.includes("经典微博正文第一段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("经典微博正文第二段"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("微博网页版"))).toBe(false)
  })

  it("extracts direct wbtext detail bodies that are split by br tags", () => {
    document.body.innerHTML = `
      <main>
        <div class="_wbtext_1h76l_19">
          昨天交了两个项目，6月的工作终于算快完成了。
          <br />
          <br />
          今天7月的项目也开始进入筹备，一个接一个，没有时间绝望。
          <br />
          <br />
          兵来将挡，水来土掩。尽其当然听自然。&#8203;&#8203;&#8203;
        </div>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/2694995107/R6kF1tGd5?pagetype=homefeed"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks).toHaveLength(1)
    expect(extracted?.blocks[0]?.text).toContain("昨天交了两个项目")
    expect(extracted?.blocks[0]?.text).toContain("今天7月的项目也开始进入筹备")
    expect(extracted?.blocks[0]?.text).toContain("兵来将挡，水来土掩")
  })

  it("strips video-player modal noise when it is mixed into the same detail body block", () => {
    document.body.innerHTML = `
      <main>
        <div class="_wbtext_1h76l_19">
          ${"这是微博正文第一段。".repeat(10)}
          Video Player is loading. Loaded 0% Current Time 00:00 / Duration 00:00
          This is a modal window. Beginning of dialog window. Escape will cancel and close the window.
          Font Size50%75%100%125%150%175%200%300%400%
          Text Edge StyleNoneRaisedDepressedUniformDrop shadow
          Font FamilyProportional Sans-SerifMonospace Sans-SerifProportional SerifMonospace SerifCasualScriptSmall Caps
          ResetDone Close Modal Dialog End of dialog window. 按住画面可移动小窗。
          ${"这是微博正文第二段。".repeat(10)}
        </div>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/2694995107/R6RfMl9oD?pagetype=homefeed"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks[0]?.text).toContain("这是微博正文第一段")
    expect(extracted?.blocks[0]?.text).toContain("这是微博正文第二段")
    expect(extracted?.blocks[0]?.text).not.toContain("Video Player is loading")
    expect(extracted?.blocks[0]?.text).not.toContain("Close Modal Dialog")
    expect(extracted?.blocks[0]?.text).not.toContain("按住画面可移动小窗")
  })

  it("prefers extracted article body over a short meta description fallback", () => {
    document.head.innerHTML = `<meta property="og:description" content="微博预览标题">`
    document.body.innerHTML = `
      <main>
        <article data-testid="primary-post">
          <span>${"真实正文内容".repeat(16)}</span>
        </article>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/2194035935/R6jFpmsGI"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks[0]?.text).toContain("真实正文内容")
    expect(extracted?.blocks[0]?.text).not.toBe("微博预览标题")
  })

  it("prefers the explicit WB_text detail body over unrelated color and opacity tool text", () => {
    document.body.innerHTML = `
      <main>
        <div class="WB_text W_f14">
          <div>${"真实微博正文".repeat(20)}</div>
        </div>
        <div>
          ColorWhiteBlackRedGreenBlueYellowMagentaCyan
          OpacityOpaqueSemi-TransparentTransparent
        </div>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/2194035935/R6jFpmsGI"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks.some((block) => block.text.includes("真实微博正文"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("ColorWhiteBlackRedGreenBlue"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("OpacityOpaque"))).toBe(false)
  })

  it("returns null when only weibo service shell text is available before the detail body hydrates", () => {
    document.body.innerHTML = `
      <main>
        <div lang="zh-CN">NEW 3 无障碍 返回 帮助中心 微博客服 4000-960-960 自助服务中心 常见问题 合作&服务</div>
      </main>
    `

    expect(
      extractWeiboArticleDocumentFromPage({
        root: document,
        url: "https://weibo.com/1657210044/R6PwixIhq"
      })
    ).toBeNull()
  })

  it("returns null when only the logged-in sidebar shell is available before the detail article body hydrates", () => {
    document.body.innerHTML = `
      <div id="app">
        <div class="page-shell">
          <aside class="left-sidebar">
            <div class="group-list">
              全部关注 最新微博 特别关注 好友圈 管理 AI相关 2 粤地之友 朋友家属 学校老师 社会事件 其他 微博业界动态 Weiboyi 媒体 1 北大校友 1
            </div>
          </aside>
          <main class="detail-main">
            <div class="topbar">返回</div>
            <section class="detail-shell">
              <header>新智元</header>
            </section>
          </main>
        </div>
      </div>
    `

    expect(
      extractWeiboArticleDocumentFromPage({
        root: document,
        url: "https://weibo.com/5703921756/R6YFqp5eK?pagetype=homefeed"
      })
    ).toBeNull()
  })

  it("prefers the hydrated wbtext detail body over the surrounding service shell text", () => {
    document.body.innerHTML = `
      <main>
        <div lang="zh-CN">NEW 3 无障碍 返回 帮助中心 微博客服 4000-960-960 自助服务中心 常见问题 合作&服务</div>
        <div class="_wbtext_1h76l_19">
          我对标codex开发的codem重大更新。
          <br />
          实现多智能体协作（如图1）。主智能体工作，唤醒子智能体工作，然后回收工作，评估子智能体（然后跌代，直到通过loop模式），主智能体集成多子智能体工作成果后集成输出。
          <br />
          可以实时查看子智能体工作进度和工具调用情况（如图2）。
          <br />
          目前已经完成codex的60%功能了。
          <br />
          下一步准备反编译codex和claude的系统提示词，把他们的系统级提示词能力集成进来。
        </div>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/1657210044/R6PwixIhq"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks).toHaveLength(1)
    expect(extracted?.blocks[0]?.text).toContain("我对标codex开发的codem重大更新")
    expect(extracted?.blocks[0]?.text).toContain("实现多智能体协作")
    expect(extracted?.blocks[0]?.text).toContain("可以实时查看子智能体工作进度和工具调用情况")
    expect(extracted?.blocks[0]?.text).not.toContain("帮助中心")
    expect(extracted?.blocks[0]?.text).not.toContain("微博客服")
  })

  it("extracts modern article body text from the wbpro feed detail selector chain", () => {
    document.body.innerHTML = `
      <div id="app">
        <div class="woo-box-flex woo-box-column _wrap_1ubn9_8 _wrap_1ubn9_8">
          <div class="woo-box-flex _content_1ubn9_18 _content_1ubn9_18">
            <div></div>
            <main>
              <div class="_full_1l406_7">
                <div>
                  <div class="woo-panel-main woo-panel-top woo-panel-right woo-panel-bottom woo-panel-left _detail_zsq3w_2 _wrap_6c8b7_2 _bottomGap_6c8b7_6 _detail_zsq3w_2">
                    <article>
                      <div class="_body_ecgcn_63">
                        <div>
                          <div class="_text_1h76l_2 _ogText_1h76l_43 wbpro-feed-ogText">
                            <div class="_wbtext_1h76l_19">
                              我对标codex开发的codem重大更新。
                              <br />
                              实现多智能体协作（如图1）。主智能体工作，唤醒子智能体工作，然后回收工作，评估子智能体（然后跌代，直到通过loop模式），主智能体集成多子智能体工作成果后集成输出。
                              <br />
                              可以实时查看子智能体工作进度和工具调用情况（如图2）。
                              <br />
                              目前已经完成codex的60%功能了。
                              <br />
                              下一步准备反编译codex和claude的系统提示词，把他们的系统级提示词能力集成进来。
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/1657210044/R6PwixIhq"
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.blocks[0]?.text).toContain("我对标codex开发的codem重大更新")
    expect(extracted?.blocks[0]?.text).toContain("实现多智能体协作")
    expect(extracted?.blocks[0]?.text).toContain("下一步准备反编译codex和claude的系统提示词")
  })

  it("filters split video-player accessibility fragments out of a detail page body", () => {
    document.body.innerHTML = `
      <main>
        <div class="_wbtext_1h76l_19">
          <span>${"这是微博正文第一段。".repeat(10)}</span>
          <span>Video Player is loading.</span>
          <span>Loaded 0%</span>
          <span>Current Time 00:00 / Duration 00:00</span>
          <span>This is a modal window.</span>
          <span>Beginning of dialog window.</span>
          <span>Escape will cancel and close the window.</span>
          <span>ResetDone Close Modal Dialog End of dialog window.</span>
          <span>按住画面可移动小窗。</span>
          <span>${"这是微博正文第二段。".repeat(10)}</span>
        </div>
      </main>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/7782884695/R6Scqe7Zc"
    })
    const combinedText = extracted?.blocks.map((block) => block.text).join(" ") ?? ""

    expect(extracted).not.toBeNull()
    expect(combinedText).toContain("这是微博正文第一段")
    expect(combinedText).toContain("这是微博正文第二段")
    expect(combinedText).not.toContain("Video Player is loading")
    expect(combinedText).not.toContain("Loaded 0%")
    expect(combinedText).not.toContain("Current Time 00:00 / Duration 00:00")
    expect(combinedText).not.toContain("This is a modal window")
    expect(combinedText).not.toContain("Escape will cancel and close the window")
    expect(combinedText).not.toContain("Close Modal Dialog")
    expect(combinedText).not.toContain("按住画面可移动小窗")
  })

  it("prefers the single-article正文 over a left sidebar full of custom group names", () => {
    document.body.innerHTML = `
      <div id="app">
        <div class="page-shell">
          <aside class="left-sidebar">
            <div class="group-list">
              全部关注 最新微博 特别关注 好友圈 管理 AI相关 2 粤地之友 朋友家属 学校老师 社会事件 其他 微博业界动态 Weiboyi 媒体 1 北大校友 1
            </div>
          </aside>
          <main class="detail-main">
            <div class="topbar">返回</div>
            <section class="detail-shell">
              <header>新智元</header>
              <article>
                <div class="body-shell">
                  <div class="paragraph">#曝阿里禁用claude# 就在刚刚，阿里巴巴内部下发通知。</div>
                  <div class="paragraph">全面禁用Claude，7月10日正式生效。</div>
                  <div class="paragraph">全系拉黑Sonnet、Opus、Fable。</div>
                  <div class="paragraph">连同Claude Code在内，员工电脑上一个都不能留。</div>
                  <div class="paragraph">阿里经综合评估后已将其列入高风险软件名单。</div>
                  <div class="paragraph">并推荐使用自研Qoder作为替代方案。</div>
                </div>
              </article>
            </section>
          </main>
        </div>
      </div>
    `

    const extracted = extractWeiboArticleDocumentFromPage({
      root: document,
      url: "https://weibo.com/5703921756/R6YFqp5eK?pagetype=homefeed"
    })
    const combinedText = extracted?.blocks.map((block) => block.text).join(" ") ?? ""
    const compactLeadingText = extracted?.blocks.slice(0, 3).map((block) => block.text).join(" ") ?? ""

    expect(extracted).not.toBeNull()
    expect(combinedText).toContain("#曝阿里禁用claude#")
    expect(combinedText).toContain("Claude Code")
    expect(combinedText).toContain("自研Qoder")
    expect(compactLeadingText).toContain("#曝阿里禁用claude#")
    expect(compactLeadingText).toContain("全面禁用Claude")
    expect(combinedText).not.toContain("全部关注 最新微博 特别关注 好友圈")
    expect(combinedText).not.toContain("AI相关 2 粤地之友")
    expect(combinedText).not.toContain("返回")
  })
})
