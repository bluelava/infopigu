// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { extractWechatDocument } from "../../src/content/extractors/wechatExtractor"

describe("extractWechatDocument", () => {
  it("filters hotline, complaint, and copyright footer text", () => {
    document.body.innerHTML = `
      <h1 id="activity-name">公众号文章</h1>
      <div id="js_name">认知增量实验室</div>
      <section id="js_content">
        <p>${"公众号正文".repeat(40)}</p>
        <p>合作热线号码为4000-980-980。</p>
        <p>违规投诉电话为010-60618076。</p>
        <p>版权所有年份范围是2009年至2026年。</p>
      </section>
    `

    const extracted = extractWechatDocument()

    expect(extracted?.blocks.some((block) => block.text.includes("4000-980-980"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("010-60618076"))).toBe(false)
    expect(extracted?.blocks.some((block) => block.text.includes("2009年至2026年"))).toBe(false)
  })

  it("stops collecting after entering the tail information section", () => {
    document.body.innerHTML = `
      <h1 id="activity-name">公众号文章</h1>
      <div id="js_name">认知增量实验室</div>
      <section id="js_content">
        <p>${"第一段正文".repeat(30)}</p>
        <p>${"第二段正文".repeat(30)}</p>
        <p>合作热线号码为4000-980-980。</p>
        <p>${"不应继续提取的尾部区域".repeat(20)}</p>
      </section>
    `

    const extracted = extractWechatDocument()

    expect(extracted?.blocks.some((block) => block.text.includes("第一段正文"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("第二段正文"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("尾部区域"))).toBe(false)
  })
})
