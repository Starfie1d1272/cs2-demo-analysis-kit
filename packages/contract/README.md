# @cs2dak/contract

原始 Demo 输入、基础事实与 QA 的共享 schema/type。评分、cohort、战术和展示各自拥有其领域合同。

原始格式语义来自精确固定的 `cs2-demo-format` 源码。构建时生成原版 schema 的 ESM 和完整声明，校验源文件哈希并附许可证与 provenance。源码上游仅为 devDependency，消费者安装本包不会安装上游 parser 或 JSZip。

runtime dependency 为 Zod。ZIP 加载和诊断由 `@cs2dak/demo-io` 提供；工作台与组件 props/type 从 `@cs2dak/presentation` 导入。
