export const manifest = {
  manifest_version: 3,
  name: "Cognitive Delta",
  version: "0.1.0",
  description:
    "Analyze repeated information in whitelisted reading surfaces and show duplicate versus novel claims.",
  permissions: ["storage", "scripting", "activeTab", "sidePanel", "downloads", "tabs"],
  host_permissions: [
    "https://api.openai.com/*",
    "https://api.deepseek.com/*",
    "https://open.bigmodel.cn/*"
  ],
  optional_host_permissions: ["https://*/*", "http://*/*"],
  content_scripts: [
    {
      js: ["src/content/contentScript.ts"],
      matches: ["https://*/*", "http://*/*"],
      run_at: "document_idle"
    }
  ],
  background: {
    service_worker: "src/background/serviceWorker.ts",
    type: "module"
  },
  action: {
    default_popup: "index.html"
  },
  options_page: "options.html",
  side_panel: {
    default_path: "sidepanel.html"
  },
  web_accessible_resources: [
    {
      resources: ["viz-kdb.html"],
      matches: ["<all_urls>"]
    }
  ]
} satisfies chrome.runtime.ManifestV3
