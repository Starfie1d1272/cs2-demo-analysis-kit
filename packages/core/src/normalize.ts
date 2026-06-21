import { demoPackageSchema, type DemoPackage } from "@cs2dak/contract";

export function parsePackageJson(text: string): unknown {
  return JSON.parse(text.replace(/\bNaN\b/g, "null"));
}

/**
 * 已校验过的 DemoPackage 打标，避免对同一对象重复跑整包 zod 解析。
 * 单场 facts 抽取里 buildOpeningTrails（每选手一次）/ workspace / 各 extract* 都会
 * 再调 normalizeDemoPackage(pkg)；已规范化对象直接复用即可（zod parse 对已验证对象幂等）。
 */
const normalized = new WeakSet<object>();

/**
 * 重型数组（replay ~17MB / duels ~11MB）排除在 zod 校验之外：上游 cs2-demo-format 的
 * replay/duels schema 是纯校验（无 transform/refine/coerce），JSON.parse 出来即最终形状，
 * 跑 zod 只是把它们整张深拷贝一遍——这正是单场导入的内存峰值主因（graph#1 原图 +
 * graph#2 zod 拷贝同时存在）。校验其余小/中型 section，replay/duels 按引用挂回，
 * 避免百 MB 级深拷贝，单场峰值大致砍半。
 */
const leanSchema = demoPackageSchema.omit({ replay: true, duels: true });

export function normalizeDemoPackage(input: unknown): DemoPackage {
  if (typeof input === "object" && input !== null && normalized.has(input)) {
    return input as DemoPackage;
  }
  const raw = (input ?? {}) as { replay?: unknown; duels?: unknown };
  const { replay, duels } = raw;
  // leanSchema 会 strip 掉 replay/duels；校验完按引用挂回原数组，不深拷贝。
  const pkg = leanSchema.parse(input) as DemoPackage;
  if (replay !== undefined) (pkg as { replay?: unknown }).replay = replay;
  if (duels !== undefined) (pkg as { duels?: unknown }).duels = duels;
  normalized.add(pkg);
  return pkg;
}
