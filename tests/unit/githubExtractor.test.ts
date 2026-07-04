// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { extractGithubRepoDocument } from "../../src/content/extractors/githubExtractor"
import { classifyPageKind } from "../../src/content/pageKind"

describe("github extractor", () => {
  it("classifies only repository home pages as supported github pages", () => {
    document.body.innerHTML = `<main><div>repo shell</div></main>`

    expect(
      classifyPageKind(new URL("https://github.com/0xNyk/council-of-high-intelligence"), document)
    ).toBe("github-repo")
    expect(
      classifyPageKind(new URL("https://github.com/0xNyk/council-of-high-intelligence/issues"), document)
    ).toBe("unsupported")
  })

  it("extracts repository about text and readme content from the repo homepage", () => {
    document.head.innerHTML = `
      <meta name="description" content="A council of agentic systems that collaborate together." />
      <meta name="octolytics-dimension-repository_nwo" content="0xNyk/council-of-high-intelligence" />
    `
    document.body.innerHTML = `
      <main>
        <div class="BorderGrid">
          <div class="BorderGrid-row">
            <div class="BorderGrid-cell">
              <p class="f4 tmp-my-3">A council of agentic systems that collaborate together.</p>
            </div>
          </div>
        </div>
        <article class="markdown-body entry-content container-lg" itemprop="text">
          <h2>Overview</h2>
          <p>This repository coordinates multiple intelligent workers under one council.</p>
          <li>Supports planner and executor agents.</li>
        </article>
      </main>
    `

    const extracted = extractGithubRepoDocument()

    expect(extracted?.extractor).toBe("github-repo")
    expect(extracted?.title).toBe("0xNyk/council-of-high-intelligence")
    expect(extracted?.blocks.some((block) => block.text.includes("collaborate together"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("coordinates multiple intelligent workers"))).toBe(true)
    expect(extracted?.blocks.some((block) => block.text.includes("planner and executor agents"))).toBe(true)
  })
})
