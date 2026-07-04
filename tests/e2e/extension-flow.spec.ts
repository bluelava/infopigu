import { expect, test } from "@playwright/test"
import { chromium, type BrowserContext, type Page } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"

interface MockArticlePage {
  readonly bodyText: string
  readonly html: string
  readonly url: string
}

const testDirectoryPath = path.dirname(fileURLToPath(import.meta.url))
const extensionPath = path.resolve(testDirectoryPath, "../../dist")
const chromiumProfilePath = "/private/tmp/cognitive-delta-e2e-profile"

const genericArticlePage: MockArticlePage = {
  url: "https://example.com/article",
  bodyText:
    "OpenAI released a browser extension that detects repeated information and helps users decide whether to keep reading.",
  html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Example Article</title>
  </head>
  <body>
    <main>
      <article>
        <h1>Example Article</h1>
        <p>${"OpenAI released a browser extension that detects repeated information and helps users decide whether to keep reading. ".repeat(20)}</p>
      </article>
    </main>
  </body>
</html>`
}

const wechatArticlePage: MockArticlePage = {
  url: "https://mp.weixin.qq.com/s/8dbFvYgH0eZioR8DuBSpcw",
  bodyText:
    "微信公众号文章强调重复信息过滤只处理正文文本，不分析图片视频和音频壳层。",
  html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>微信公众号文章</title>
  </head>
  <body>
    <h1 id="activity-name">微信公众号文章</h1>
    <div id="js_name">认知增量实验室</div>
    <section id="js_content">
      <p>${"微信公众号文章强调重复信息过滤只处理正文文本，不分析图片视频和音频壳层。".repeat(16)}</p>
      <img alt="cover" src="/cover.jpg" />
      <video controls></video>
    </section>
  </body>
</html>`
}

const weiboDetailPage: MockArticlePage = {
  url: "https://weibo.com/1233486457/R2psYmPIp?pagetype=homefeed",
  bodyText:
    "微博详情页正文聚焦主帖文本内容，忽略评论转发推荐等壳层交互文案。",
  html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>微博详情页</title>
  </head>
  <body>
    <main>
      <article data-testid="primary-post">
        <h1>微博详情页</h1>
        <p>${"微博详情页正文聚焦主帖文本内容，忽略评论转发推荐等壳层交互文案。".repeat(18)}</p>
        <span>评论</span>
        <span>推荐</span>
      </article>
    </main>
  </body>
</html>`
}

const weiboFeedPage: MockArticlePage = {
  url: "https://weibo.com/",
  bodyText:
    "微博首页 feed 卡片可以在阅读停留后生成 claim，并且不会把评论推荐按钮当成正文。",
  html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>微博首页</title>
  </head>
  <body>
    <main data-surface="home-feed">
      <article role="article">
        <p>${"微博首页 feed 卡片可以在阅读停留后生成 claim，并且不会把评论推荐按钮当成正文。".repeat(18)}</p>
        <span>评论</span>
        <span>推荐</span>
      </article>
      <article role="article">
        <p>${"另一条微博卡片用于维持 feed 形态识别，确保页面不会被误判为单篇正文。".repeat(18)}</p>
        <span>展开</span>
      </article>
    </main>
  </body>
</html>`
}

async function createExtensionContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(chromiumProfilePath, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  })
}

function extractBodyClaimText(text: string): string {
  return text.slice(0, 64)
}

async function configureMockRoutes(
  context: BrowserContext,
  pages: readonly MockArticlePage[]
): Promise<void> {
  for (const page of pages) {
    await context.route(page.url, async (route) => {
      await route.fulfill({
        body: page.html,
        contentType: "text/html",
        status: 200
      })
    })
  }

  await context.route("https://api.openai.com/v1/embeddings", async (route) => {
    const body = route.request().postDataJSON() as {
      readonly input: string | readonly string[]
    }
    const inputs = Array.isArray(body.input) ? body.input : [body.input]

    await route.fulfill({
      body: JSON.stringify({
        data: inputs.map(() => ({ embedding: [1, 0, 0.5] }))
      }),
      contentType: "application/json",
      status: 200
    })
  })

  await context.route("https://api.openai.com/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON() as {
      readonly messages: readonly {
        readonly content: string
        readonly role: string
      }[]
    }
    const userMessage = body.messages.find((message) => message.role === "user")

    if (userMessage === undefined) {
      throw new Error("expected user message in mocked chat completion request")
    }

    const parsed = JSON.parse(userMessage.content) as {
      readonly chunks: readonly {
        readonly chunk_id: string
        readonly content: string
      }[]
    }
    const firstChunk = parsed.chunks[0]

    if (firstChunk === undefined) {
      throw new Error("expected at least one chunk in mocked chat completion request")
    }

    await route.fulfill({
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                claims: [
                  {
                    text: extractBodyClaimText(firstChunk.content),
                    type: "fact",
                    importance: 0.9,
                    confidence: 0.9,
                    entities: ["Cognitive Delta"],
                    source_chunk_id: firstChunk.chunk_id
                  }
                ]
              })
            }
          }
        ]
      }),
      contentType: "application/json",
      status: 200
    })
  })
}

async function getExtensionId(context: BrowserContext): Promise<string> {
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 20_000 }))

  return new URL(serviceWorker.url()).host
}

async function openOptionsPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  return page
}

async function configureExtensionForHost(
  optionsPage: Page,
  domain: string,
  dwellThresholdSeconds: number
): Promise<void> {
  await optionsPage.fill('input[placeholder="example.com"]', domain)
  await optionsPage.getByRole("button", { name: "添加" }).click()

  await optionsPage.getByLabel("Provider 名称").fill("OpenAI")
  await optionsPage.getByLabel("Base URL").fill("https://api.openai.com/v1")
  await optionsPage.locator("#provider-api-key-input").fill("sk-test")
  await optionsPage.getByLabel("Embeddings 模型").fill("text-embedding-3-small")
  await optionsPage.getByLabel("Claim 模型").fill("gpt-4.1-mini")
  await optionsPage.getByRole("button", { name: "保存 Provider" }).click()
  await optionsPage.getByRole("button", { name: "设为 Claim" }).first().click()
  await optionsPage.getByRole("button", { name: "设为 Embedding" }).first().click()
  await optionsPage.locator('input[type="number"]').fill(String(dwellThresholdSeconds))
}

async function expectAnalysisForPage(
  context: BrowserContext,
  extensionId: string,
  page: MockArticlePage
): Promise<void> {
  const articlePage = await context.newPage()
  await articlePage.goto(page.url)

  const sidepanelPage = await context.newPage()
  await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await sidepanelPage.waitForFunction(async () => {
    const result = await chrome.storage.local.get("latestAnalysisResult")
    return result["latestAnalysisResult"] !== undefined
  })

  await expect(sidepanelPage.getByText("建议阅读")).toBeVisible()
  await expect(sidepanelPage.getByText("新增信息")).toBeVisible()
  await expect(sidepanelPage.getByText(extractBodyClaimText(page.bodyText))).toBeVisible()
}

test.describe("Cognitive Delta extension", () => {
  test("runs the whitelisted generic article analysis flow", async () => {
    const context = await createExtensionContext()

    try {
      await configureMockRoutes(context, [genericArticlePage])

      const extensionId = await getExtensionId(context)
      const optionsPage = await openOptionsPage(context, extensionId)

      await configureExtensionForHost(optionsPage, "example.com", 1)
      await expectAnalysisForPage(context, extensionId, genericArticlePage)
    } finally {
      await context.close()
    }
  })

  test("analyzes a WeChat article page through the explicit wechat route", async () => {
    const context = await createExtensionContext()

    try {
      await configureMockRoutes(context, [wechatArticlePage])

      const extensionId = await getExtensionId(context)
      const optionsPage = await openOptionsPage(context, extensionId)

      await configureExtensionForHost(optionsPage, "mp.weixin.qq.com", 1)
      await expectAnalysisForPage(context, extensionId, wechatArticlePage)
    } finally {
      await context.close()
    }
  })

  test("analyzes a Weibo detail page through the explicit weibo article route", async () => {
    const context = await createExtensionContext()

    try {
      await configureMockRoutes(context, [weiboDetailPage])

      const extensionId = await getExtensionId(context)
      const optionsPage = await openOptionsPage(context, extensionId)

      await configureExtensionForHost(optionsPage, "weibo.com", 1)
      await expectAnalysisForPage(context, extensionId, weiboDetailPage)
    } finally {
      await context.close()
    }
  })

  test("analyzes a Weibo home feed card through the explicit weibo feed route", async () => {
    const context = await createExtensionContext()

    try {
      await configureMockRoutes(context, [weiboFeedPage])

      const extensionId = await getExtensionId(context)
      const optionsPage = await openOptionsPage(context, extensionId)

      await configureExtensionForHost(optionsPage, "weibo.com", 1)
      await expectAnalysisForPage(context, extensionId, weiboFeedPage)
    } finally {
      await context.close()
    }
  })
})
