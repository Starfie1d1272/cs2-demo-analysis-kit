import { demoPackageSchema, type DemoPackage } from "@cs2dak/contract";

export function parsePackageJson(text: string): unknown {
  return JSON.parse(text.replace(/\bNaN\b/g, "null"));
}

export function normalizeDemoPackage(input: unknown): DemoPackage {
  return demoPackageSchema.parse(input);
}
