// قائمة الملفات المشتركة: مرفقات الطلب (input) والتسليمات (deliverable) — SPEC §12/04.
// الصف إما ملف مرفوع (path/size/mime) أو رابط خارجي (url) من تسليم المصمم.

import {
  Download,
  ExternalLink,
  FileArchive,
  FileImage,
  FileText,
  FileVideo,
  File,
  Link2,
} from "lucide-react";
import { DataTable, type DataColumn } from "@/components/domain/data-table";
import { formatBytes, formatDateTime } from "@/lib/format";

export interface FileRow {
  id: number;
  filename: string;
  version: string | null;
  size: number | null;
  mime: string | null;
  url: string | null;
  uploaderName: string;
  createdAt: string;
}

function FileIcon({ mime, isLink }: { mime: string | null; isLink: boolean }) {
  const cls = "size-4";
  if (isLink) return <Link2 className={`${cls} text-info`} />;
  if (mime?.startsWith("image/")) return <FileImage className={`${cls} text-info`} />;
  if (mime?.startsWith("video/")) return <FileVideo className={`${cls} text-progress`} />;
  if (mime === "application/pdf") return <FileText className={`${cls} text-danger`} />;
  if (mime?.includes("zip") || mime?.includes("rar") || mime?.includes("7z"))
    return <FileArchive className={`${cls} text-warning`} />;
  return <File className={`${cls} text-muted-foreground`} />;
}

export function FileList({ files, withVersion }: { files: FileRow[]; withVersion?: boolean }) {
  const columns: DataColumn<FileRow>[] = [
    ...(withVersion
      ? [
          {
            key: "version",
            header: "الإصدار",
            cell: (f: FileRow) =>
              f.version ? (
                <span className="rounded bg-navy/10 px-1.5 py-0.5 text-xs font-medium text-navy" dir="ltr">
                  {f.version}
                </span>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    {
      key: "filename",
      header: "الملف / الرابط",
      cell: (f) => (
        <span className="flex items-center gap-2" title={f.url ?? undefined}>
          <FileIcon mime={f.mime} isLink={!!f.url} />
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-64 truncate text-info hover:underline"
              dir="ltr"
            >
              {f.filename}
            </a>
          ) : (
            f.filename
          )}
        </span>
      ),
    },
    { key: "date", header: "تاريخ الإضافة", cell: (f) => formatDateTime(f.createdAt) },
    { key: "by", header: "أضيف بواسطة", cell: (f) => f.uploaderName },
    {
      key: "size",
      header: "الحجم",
      cell: (f) => (f.size != null ? <span dir="ltr">{formatBytes(f.size)}</span> : "—"),
    },
    {
      key: "actions",
      header: "إجراءات",
      cell: (f) =>
        f.url ? (
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border p-1.5 text-muted-foreground hover:bg-muted hover:text-navy"
            aria-label={`فتح الرابط ${f.filename}`}
          >
            <ExternalLink className="size-4" />
          </a>
        ) : (
          <a
            href={`/api/files/${f.id}`}
            className="inline-flex items-center gap-1 rounded-lg border p-1.5 text-muted-foreground hover:bg-muted hover:text-navy"
            aria-label={`تنزيل ${f.filename}`}
          >
            <Download className="size-4" />
          </a>
        ),
    },
  ];

  if (files.length === 0) {
    return <p className="p-4 text-center text-sm text-muted-foreground">لا ملفات بعد</p>;
  }
  return <DataTable columns={columns} rows={files} rowKey={(f) => f.id} />;
}
