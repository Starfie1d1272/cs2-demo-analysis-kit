import { demoPackageSchema, type DemoPackage } from "@cs2dak/contract";

export function parsePackageJson(text: string): unknown {
  return JSON.parse(text.replace(/\bNaN\b/g, "null"));
}

/**
 * 已校验过的 DemoPackage 打标，避免对同一对象重复跑整包 zod 解析。
 * 单场 facts 抽取里 buildOpeningTrails（每选手一次）/ workspace / 各 extract* 都会
 * 再调 normalizeDemoPackage(pkg)；整包含 17MB replay，每次 parse 都深拷贝重建整张对象图，
 * 是导入内存峰值的主因。已规范化对象直接复用即可（zod parse 是纯校验+拷贝，对已验证对象幂等）。
 */
const normalized = new WeakSet<object>();

export function normalizeDemoPackage(input: unknown): DemoPackage {
  if (typeof input === "object" && input !== null && normalized.has(input)) {
    return input as DemoPackage;
  }
  const pkg = demoPackageSchema.parse(input);
  normalized.add(pkg);
  return pkg;
}
