---
"@cs2dak/maps": patch
---

包含根入口静态引用的 map-zones JSON，修复独立 tarball 消费者加载 Maps、Core 与 Presentation 根入口时的 ERR_MODULE_NOT_FOUND。不改变导出、数据语义或公共包架构。
