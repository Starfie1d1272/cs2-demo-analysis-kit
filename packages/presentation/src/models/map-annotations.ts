import { z } from "zod";

/** A point on a radar image; coordinates are normalized to the image itself. */
export const mapAnnotationViewSchema = z.object({
  id: z.string(),
  kind: z.enum(["position", "smoke", "flash", "fire", "note"]),
  label: z.string(),
  u: z.number().finite().min(0).max(1),
  v: z.number().finite().min(0).max(1),
  level: z.enum(["upper", "lower"]),
});
export type MapAnnotationView = z.infer<typeof mapAnnotationViewSchema>;
