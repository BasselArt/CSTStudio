// خرائط صفوف Tailwind لمفاتيح الألوان (ColorToken) — الجسر الوحيد بين
// core/constants وصفوف الألوان. لا hex هنا؛ الصفوف مولدة من tokens globals.css.

import type { ColorToken } from "@/core/types";

/** شارة ناعمة: خلفية خافتة + نص ملوّن (نمط الصور المرجعية) */
export const TOKEN_SOFT: Record<ColorToken, string> = {
  navy: "bg-navy/10 text-navy",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  progress: "bg-progress/10 text-progress",
  waiting: "bg-waiting/10 text-waiting",
  muted: "bg-muted-token/10 text-muted-token",
};

/** خلفية مصمتة (شريط التوزيع، أشرطة التقدم) */
export const TOKEN_BG: Record<ColorToken, string> = {
  navy: "bg-navy",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  progress: "bg-progress",
  waiting: "bg-waiting",
  muted: "bg-muted-token",
};

export const TOKEN_TEXT: Record<ColorToken, string> = {
  navy: "text-navy",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  progress: "text-progress",
  waiting: "text-waiting",
  muted: "text-muted-token",
};
