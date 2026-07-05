// حفظ الملفات المرفوعة وقراءتها — storage/uploads خارج public،
// التنزيل حصريًا عبر /api/files/[id] مع فحص الصلاحية (SPEC §3 و§12/04).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AttachmentInput } from "./requests";

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (SPEC §12/03)

/** الأنواع المسموحة: JPG/PNG/PDF/MP4/ZIP (SPEC §12/03) */
const ALLOWED_EXTENSIONS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
};

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

function uploadsRoot(): string {
  return path.join(process.cwd(), "storage", "uploads");
}

/** يتحقق من النوع والحجم على الخادم ثم يكتب الملف ويعيد بياناته الوصفية */
export async function saveUpload(file: File): Promise<AttachmentInput> {
  const ext = path.extname(file.name).toLowerCase();
  const mime = ALLOWED_EXTENSIONS[ext];
  if (!mime) {
    throw new FileValidationError(
      `نوع الملف «${file.name}» غير مسموح — الأنواع المسموحة: JPG, PNG, PDF, MP4, ZIP.`,
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new FileValidationError(`حجم «${file.name}» يتجاوز الحد الأقصى 50MB.`);
  }
  if (file.size === 0) {
    throw new FileValidationError(`الملف «${file.name}» فارغ.`);
  }

  const safeName = path.basename(file.name).replaceAll(/[/\\]/g, "_");
  const relPath = path.join(
    String(new Date().getFullYear()),
    `${crypto.randomUUID()}-${safeName}`,
  );
  const absPath = path.join(uploadsRoot(), relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, Buffer.from(await file.arrayBuffer()));

  return { filename: safeName, path: relPath, size: file.size, mime };
}

/** أنواع الشعار المسموحة وحده الأقصى */
const LOGO_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
export const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB

export function logoMime(relPath: string): string {
  return LOGO_EXTENSIONS[path.extname(relPath).toLowerCase()] ?? "image/png";
}

/** حفظ شعار النظام في storage/uploads/branding ويعيد المسار النسبي */
export async function saveBrandingLogo(file: File): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  if (!LOGO_EXTENSIONS[ext]) {
    throw new FileValidationError("نوع الشعار غير مسموح — الأنواع المسموحة: PNG, JPG, WEBP.");
  }
  if (file.size > MAX_LOGO_SIZE) {
    throw new FileValidationError("حجم الشعار يتجاوز الحد الأقصى 2MB.");
  }
  if (file.size === 0) {
    throw new FileValidationError("ملف الشعار فارغ.");
  }

  const relPath = path.join("branding", `logo-${crypto.randomUUID()}${ext}`);
  const absPath = path.join(uploadsRoot(), relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, Buffer.from(await file.arrayBuffer()));
  return relPath;
}

/** قراءة ملف مرفق للتنزيل — يرفض أي مسار يخرج عن مجلد الرفع */
export function readAttachmentFile(relPath: string): Buffer {
  const abs = path.resolve(uploadsRoot(), relPath);
  if (!abs.startsWith(path.resolve(uploadsRoot()))) {
    throw new FileValidationError("مسار ملف غير صالح.");
  }
  return fs.readFileSync(abs);
}
