# Third-Party Notices

本仓库按双轨许可分发：生态部分（`@cs2dak/*`、Python exporter、demo-lab）为
[MIT](LICENSE)，DAK Studio 产品（`apps/dak-studio/`）为
[AGPL-3.0-only](apps/dak-studio/LICENSE)。以下代码/算法有外部出处，按各自条款致谢：

## 移植代码

- **CS2-insight-agent**（DrEAmSs59）— `python/src/cs2dak/parse_worker.py` 与
  `python/src/cs2dak/exporter.py` 的最初版本自该项目的
  `backend/app/rivalhub_parse_worker.py` 移植，已获原作者授权按本仓库 MIT 许可证分发。

## 改编算法

- **simpleheat**（Vladimir Agafonkin，BSD-2-Clause）—
  `packages/react/src/components/HeatmapCanvas.tsx` 的两段式热力图渲染算法改编自
  simpleheat，并参考了 CS Demo Manager（MIT）的参数默认值。

## 设计借鉴（无代码复制）

- [CS Demo Manager](https://github.com/akiver/cs-demo-manager)（MIT）— 工作台信息架构。
- [AWPy](https://github.com/pnxenopoulos/awpy)（MIT）— 分析口径严谨性。
- [CS2 2D Demo Viewer](https://github.com/sparkoo/csgo-2d-demo-viewer) — 回放帧模型。
- [pr1maly](https://github.com/pr1malator/pr1maly)（非商业许可证）— 仅产品调研，未使用其代码。

## 运行时依赖（各自许可证见上游）

- demoparser2（MIT）、pywebview（BSD-3-Clause）、typer / jsonschema / PyInstaller、
  React、Zod、JSZip、lucide-react 等，见各 package.json / pyproject.toml。
