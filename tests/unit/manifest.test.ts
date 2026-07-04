import { describe, expect, it } from "vitest"

import { manifest } from "../../src/manifest"

describe("manifest", () => {
  it("exposes the required MV3 permissions", () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.permissions).toContain("storage")
    expect(manifest.permissions).toContain("sidePanel")
    expect(manifest.permissions).toContain("tabs")
    expect(manifest.optional_host_permissions).toContain("https://*/*")
  })
})
