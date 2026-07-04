# Cognitive Delta

[中文](./README.md) | [English](./README_EN.md)

一个面向日常阅读场景的 Chrome 插件。它会在你浏览文章或信息流时，自动提取正文、计算重复度、识别新增知识点，并把结果沉淀到本地知识库中，再通过 Side Panel 和 Viz-KDB 可视化页面帮助你快速判断“这篇值不值得读、和我已读内容相比新增了什么”。

## 项目简介

信息过载时代，真正稀缺的不是内容，而是新增信息。

Cognitive Delta 的目标不是做传统收藏夹，也不是做简单摘要，而是围绕“信息增量”工作：

- 识别当前页面正文
- 忽略视频壳层、按钮文案、平台噪音和非正文信息
- 提取 claims（知识点）
- 与本地已读知识库做重复度比对
- 给出“重复 / 新增 / 是否值得继续读”的反馈

它适合这些场景：

- 刷微博、X 这类高频信息流时快速判断是否值得点开
- 在单篇文章详情页里查看新增知识点
- 对微信公众号、arXiv、GitHub 项目主页做知识沉淀
- 在 Viz-KDB 中回看自己已经读过的主题、平台和时间线分布

## 插件特性

- 支持信息流与单篇文章两种阅读模式
- 自动或手动触发重复度计算
- 从正文中提取新增知识点，过滤作者、发布时间、终端信息等噪音
- Side Panel 展示重复来源、相似内容和新增 claims
- New Claims Popup 浮窗展示当前页面的新知识点
- 本地 KDB（Knowledge Database）沉淀已读内容
- Viz-KDB 支持网络视图和时间线视图
- 域名统计支持白名单域名聚合展示
- 多语言界面支持 `简体中文 / 繁体中文 / English`
- Provider 可配置，当前支持：
  - OpenAI
  - DeepSeek
  - BigModel
  - 自定义 OpenAI Compatible 接口

## 当前支持的平台

- `weibo.com`
  - feeds 流
  - 单篇文章详情页
- `x.com`
  - feeds 流
  - 单篇帖子详情页
- `mp.weixin.qq.com`
  - 公众号单篇文章
- `arxiv.org/abs/...`
  - 抽取摘要用于重复度和知识点分析
- `github.com/<owner>/<repo>`
  - 抽取项目介绍和 README 作为分析来源
- 通用正文页面
  - 对存在明显正文结构的普通文章页做基础支持

## 安装使用

### 1. 安装依赖

```bash
pnpm install
```

### 2. 构建插件

```bash
pnpm build
```

构建完成后：

- Chrome 可加载目录：`dist/`
- 发布归档产物：`release/cognitive-delta-extension.zip`

### 3. 在 Chrome 中加载

1. 打开 `chrome://extensions/`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前仓库下的 `dist/` 目录

### 4. 首次配置

安装完成后，建议先打开插件的 `Options` 页面完成配置：

1. 添加白名单域名
2. 配置 Claim Provider
3. 配置 Embedding Provider
4. 选择默认模型
5. 根据需要调整自动分析、停留阈值、语言和主题

推荐先加入这些白名单域名：

- `weibo.com`
- `x.com`
- `mp.weixin.qq.com`
- `arxiv.org`
- `github.com`

## 使用方式

### 信息流模式

在微博或 X 的 feeds 页面中，插件会在单条 feed 附近显示重复度浮动按钮。满足停留条件后，会对当前这条内容执行正文提取和重复度分析。

你可以快速知道：

- 这条内容是不是你已经看过的旧信息
- 它是否只是重复转述
- 是否包含新的 claims 值得点进详情页继续读

### 单篇文章模式

在单篇正文页中，插件会：

- 提取当前文章正文
- 计算重复度
- 抽取新增知识点
- 在 Side Panel 中展示详情
- 在 KDB 图标 hover 时重新展示当前页面的知识点浮窗

### Viz-KDB 可视化

插件还提供一个本地知识库可视化页面，用来查看：

- 已读文档数量
- 分类分布
- 域名平台分布
- 网络关系图
- 时间线视图

适合回看“最近读了哪些内容、都集中在哪些主题和平台上”。

## 使用截图

### 插件总览 / 设置 / 介绍

![插件汇总页面](./intro/screenshoots/Chrome浏览器插件-汇总页面.png)

![插件设置页面](./intro/screenshoots/Chrome浏览器插件-设置页面.png)

![插件介绍页面](./intro/screenshoots/Chrome浏览器插件-介绍页面.png)

### 微博场景

![微博信息流运行界面](./intro/screenshoots/微博+插件运行界面_01.png)

![微博单篇文章重复度计算](./intro/screenshoots/微博+插件运行界面_02-单篇文章计算重复度.png)

![Side Panel 查看详情](./intro/screenshoots/微博+插件运行界面_03-SidePanel查看详情.png)

### Viz-KDB 知识库可视化

![Viz-KDB 页面](./intro/screenshoots/Chrome浏览器插件-知识库可视化页面.png)

![Viz-KDB 页面 02](./intro/screenshoots/Chrome浏览器插件-知识库可视化页面-02.png)

## 开发命令

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
```

## 目录结构

```text
src/
  background/   后台任务、分析队列、Provider 调用
  content/      页面识别、正文提取、浮动按钮、Popup 交互
  sidepanel/    结果详情面板
  options/      配置页
  vizkdb/       本地知识库可视化
  db/           IndexedDB / Dexie 持久化
  ai/           不同 LLM / Embedding Provider 适配
tests/          单元测试、集成测试、E2E
release/        构建后的发布产物
```

## 隐私与数据说明

- 插件只会在白名单站点上启用
- 已读内容、claims、分析结果主要存储在本地知识库
- 云端调用取决于你配置的 Provider
- 是否发送到外部模型接口，取决于你的本地配置和当前分析流程

## 适合继续扩展的方向

- 新平台接入：按 `platforms/<site>/` 分目录扩展
- 更强的 claims 分类与质量评估
- 更丰富的 Viz-KDB 统计和交互
- 更完善的 Chrome Web Store 发布物料与隐私合规文档
