// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { extractArxivArticleDocument } from "../../src/content/extractors/arxivExtractor"
import { classifyPageKind } from "../../src/content/pageKind"

describe("arxiv extractor", () => {
  it("classifies arxiv abs pages as supported article pages", () => {
    document.body.innerHTML = `
      <main>
        <h1 class="title mathjax">Title: Long Horizon Reasoning for Agents</h1>
        <blockquote class="abstract mathjax">
          <span class="descriptor">Abstract:</span>
          This paper studies long-horizon reasoning agents and introduces a coordination loop.
        </blockquote>
      </main>
    `

    expect(classifyPageKind(new URL("https://arxiv.org/abs/2607.02480"), document)).toBe("arxiv-article")
  })

  it("extracts only the abstract body for arxiv abs pages", () => {
    document.body.innerHTML = `
      <main>
        <h1 class="title mathjax">Title: Long Horizon Reasoning for Agents</h1>
        <div class="authors">Authors: Somebody, Another Researcher</div>
        <blockquote class="abstract mathjax">
          <span class="descriptor">Abstract:</span>
          This paper studies long-horizon reasoning agents and introduces a coordination loop.
        </blockquote>
      </main>
    `

    const extracted = extractArxivArticleDocument()

    expect(extracted?.extractor).toBe("arxiv-article")
    expect(extracted?.title).toBe("Long Horizon Reasoning for Agents")
    expect(extracted?.blocks).toHaveLength(1)
    expect(extracted?.blocks[0]?.text).toContain("coordination loop")
    expect(extracted?.blocks[0]?.text).not.toContain("Authors:")
  })
})
