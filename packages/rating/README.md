# @cs2dak/rating

RR / PRISM 输入输出合同与公式接线。消费已经提取的信号，不读取 Demo、地图或 canonical facts。

```ts
import { computeAccountRatings, computeIndicatorRatings } from '@cs2dak/rating';

const accountRatings = computeAccountRatings(signals);
const indicatorRatings = computeIndicatorRatings(indicators);
```

公式与冻结基线归 `@rivalhub/rival-rating`。构建从固定版本的原版源生成 JS 与完整声明，记录源/声明哈希及许可证。该上游为精确 devDependency；本包 runtime 仅依赖 Zod。

`analytics.deriveRRSignals` 提取信号；pipeline 组织事实、空间上下文和评分调用。单场与 cohort 共用 frozen pro baseline，缺失输入保持 null。
