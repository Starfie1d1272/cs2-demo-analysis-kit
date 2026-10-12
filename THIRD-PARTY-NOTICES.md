# Third-Party Notices

本仓库按双轨许可分发：生态部分（`@cs2dak/*`、Python 壳）为
[MIT](LICENSE)，DAK Studio 产品（`apps/dak-studio/`）为
[AGPL-3.0-only](apps/dak-studio/LICENSE)。以下代码/算法有外部出处，按各自条款致谢：

## 移植代码

历史 Python exporter 曾参考 **CS2-insight-agent**（DrEAmSs59）的解析工作；该 exporter
已在 v3 迁移中删除，当前仓库不再包含移植的 parser/exporter 源码。

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

## simpleheat 完整许可通知

上游来源：https://github.com/mourner/simpleheat/blob/6cb44b3494ae33912bf03dbbd55da15fb57b2c37/LICENSE

以下保留上游 BSD-2-Clause 全文，随 React tgz 和 Studio 桌面前端一起分发：

```text
Copyright (c) 2015, Vladimir Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## cs2-demo-format 完整 MIT 许可通知

精确依赖源码与原文许可来源：https://github.com/Starfie1d1272/cs2-demo-format/blob/aea485d8163e1b0caa729157cf2f137159a94ff0/LICENSE

```text
MIT License

Copyright (c) 2026 Xinyu Du

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## rival-rating 完整 MIT 许可通知

精确依赖源码与原文许可来源：https://github.com/Starfie1d1272/rival-rating/blob/17b565f0f826b0b9f78548e9059d8a572b922182/LICENSE

```text
MIT License

Copyright (c) 2026 Xinyu Du

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
