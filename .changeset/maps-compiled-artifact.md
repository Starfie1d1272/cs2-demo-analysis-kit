---
"@cs2dak/maps": patch
---

现有 root、callout-grid-node/browser 和 tri-assets 入口发布编译后的 ESM 与声明，保留全部公开 API 和地图资产；修复干净 Node consumer 无法加载 node_modules 下 TypeScript 源文件，以及 ESM hasMapTri 错误使用 require 返回 false。发布前用实际 tarball 干净安装验证四个入口的导入、调用与声明解析。
