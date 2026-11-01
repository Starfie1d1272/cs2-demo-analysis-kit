# @cs2dak/demo-io

将 `cs2-demo-format/3.x` ZIP 字节加载为标准化 `DemoPackage`。ZIP 解压和输入诊断属于本包；数据 schema 属于 contract，标准化属于 core，原始 `.dem` 导出属于 cs2df。

## 公开入口

`@cs2dak/demo-io` 导出：

| API | 用途 |
|---|---|
| `loadDemoManifestFromZip(bytes)` | 只读取并校验 manifest |
| `loadDemoPackageFromZip(bytes, options?)` | 解压必需数据及选定的可选流，返回标准化 DemoPackage |
| `jsonParseFailureCause(error)` | 将 JSON 异常投影为有限类别与位置诊断 |

两种 loader 接受 `ArrayBuffer` 或 `Uint8Array`。公开类型包括 `DemoManifest`、`DemoPackageLoadOptions`、`DemoPackageLoadProfile`、`OptionalInputDiagnostic` 和 `JsonParseFailureCause`。

```ts
import { readFile } from "node:fs/promises";
import { loadDemoPackageFromZip } from "@cs2dak/demo-io";

const pkg = await loadDemoPackageFromZip(await readFile("match.zip"), {
  profile: "full",
  onDiagnostic(diagnostic) {
    console.warn(diagnostic.code, diagnostic.stage, diagnostic.message);
  },
});
```

`full` 是默认 profile，读取 replay、shots 和 duels 等可选流。`evidence` 只读取事实生产需要的文件，跳过这些可选流。必需文件缺失或无效会拒绝加载；可选流缺失、读取失败或 JSON 解析失败会生成诊断并降级。诊断回调异常不会中断这类降级。

浏览器调用方可直接传入 `File.arrayBuffer()`；文件选择、磁盘读取和后续分析由调用方编排。`onDiagnostic` 的 `cause` 可能来自底层读取异常，写入日志前应由产品现有诊断器处理。
