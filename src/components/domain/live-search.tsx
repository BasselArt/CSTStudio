"use client";

// بحث حي — يكتب q في searchParams أثناء الكتابة (debounce) ويوجه دائمًا إلى /requests.
// مشترك بين هيدر التطبيق وشريط فلاتر الطلبات.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 350;

export function LiveSearch({
  placeholder,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: {
  placeholder: string;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const interacted = useRef(false);

  /* مزامنة عند تغيير الرابط خارجيًا (إعادة ضبط الفلاتر مثلًا) */
  const urlQ = searchParams.get("q") ?? "";
  useEffect(() => {
    if (!interacted.current) setValue(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (!interacted.current) return;
    const timer = setTimeout(() => {
      const onRequests = pathname === "/requests";
      if (value === urlQ && onRequests) return;
      // من صفحة أخرى: لا ننتقل إلا عند وجود نص فعلي
      if (!onRequests && !value.trim()) return;
      const params = new URLSearchParams(onRequests ? searchParams : undefined);
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      params.delete("page"); // البحث يعيد للصفحة الأولى
      router.replace(`/requests?${params.toString()}`);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // urlQ/searchParams يتغيران نتيجة التوجيه نفسه — الاعتماد عليهما يسبب حلقة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, pathname]);

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => {
          interacted.current = true;
          setValue(e.target.value);
        }}
        placeholder={placeholder}
        className={cn("ps-9", inputClassName)}
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  );
}
