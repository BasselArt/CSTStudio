// قائمة الملفات المشتركة: مرفقات الطلب (input) والتسليمات (deliverable) — SPEC §12/04.

import { Download, FileArchive, FileImage, FileText, FileVideo, File } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/domain/data-table";
import { formatBytes, formatDateTime } from "@/lib/format";

export interface FileRow {
  id: number;
  filename: string;
  version: string | null;
  size: number;
  mime: string;
  uploaderName: string;
  createdAt: string;
}

function FileIcon({ mime }: { mime: string }) {
  const cls = "size-4";
  if (mime.startsWith("image/")) return <FileImage className={`${cls} text-info`} />;
  if (mime.startsWith("video/")) return <FileVideo className={`${cls} text-progress`} />;
  if (mime === "application/pdf") return <FileText className={`${cls} text-danger`} />;
  if (mime.includes("zip")) return <FileArchive className={`${cls} text-warning`} />;
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
      header: "اسم الملف",
      cell: (f) => (
        <span className="flex items-center gap-2">
          <FileIcon mime={f.mime} />
          {f.filename}
        </span>
      ),
    },
    { key: "date", header: "تاريخ الرفع", cell: (f) => formatDateTime(f.createdAt) },
    { key: "by", header: "رفع بواسطة", cell: (f) => f.uploaderName },
    { key: "size", header: "الحجم", cell: (f) => <span dir="ltr">{formatBytes(f.size)}</span> },
    {
      key: "actions",
      header: "إجراءات",
      cell: (f) => (
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
