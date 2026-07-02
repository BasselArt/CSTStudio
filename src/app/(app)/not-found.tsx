import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16">
      <EmptyState
        icon={FileQuestion}
        title="الطلب غير موجود"
        description="الطلب غير موجود أو لا تملك صلاحية الوصول إليه."
      />
      <Button asChild variant="outline">
        <Link href="/requests">العودة إلى الطلبات</Link>
      </Button>
    </div>
  );
}
