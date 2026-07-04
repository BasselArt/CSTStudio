"use client";

// شريط فلاتر إدارة الطلبات — كل قيمة تُكتب في searchParams (روابط قابلة للمشاركة).

import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITIES, PRIORITY_META, STATUSES, STATUS_META } from "@/core/constants";

const ALL = "__all__";

interface Option {
  value: string;
  label: string;
}

function FilterSelect({
  param,
  placeholder,
  options,
  value,
  onChange,
}: {
  param: string;
  placeholder: string;
  options: Option[];
  value: string;
  onChange: (param: string, value: string) => void;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(param, v === ALL ? "" : v)}>
      {/* سطران (تسمية + قيمة) لا يتسعان في h-8 الافتراضي — ارتفاع تلقائي مع padding مريح */}
      <SelectTrigger
        className="w-full bg-card py-1.5 ps-3 data-[size=default]:h-auto sm:w-44"
        aria-label={placeholder}
      >
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-[10px] text-muted-foreground">{placeholder}</span>
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>الكل</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RequestsFilters({
  departments,
  designers,
  types,
}: {
  departments: Option[];
  designers: Option[];
  types: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(param: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(param, value);
    else params.delete(param);
    params.delete("page"); // أي تغيير فلتر يعيد للصفحة الأولى
    router.push(`/requests?${params.toString()}`);
  }

  function reset() {
    const params = new URLSearchParams();
    const tab = searchParams.get("tab");
    if (tab) params.set("tab", tab);
    router.push(`/requests?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <form
        className="relative min-w-52 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.querySelector("input");
          setParam("q", input?.value ?? "");
        }}
      >
        <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="ابحث برقم الطلب أو العنوان"
          className="ps-9"
        />
      </form>
      <FilterSelect
        param="status"
        placeholder="الحالة"
        value={searchParams.get("status") ?? ""}
        onChange={setParam}
        options={STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))}
      />
      <FilterSelect
        param="designer"
        placeholder="المصمم"
        value={searchParams.get("designer") ?? ""}
        onChange={setParam}
        options={designers}
      />
      <FilterSelect
        param="department"
        placeholder="الجهة الطالبة"
        value={searchParams.get("department") ?? ""}
        onChange={setParam}
        options={departments}
      />
      <FilterSelect
        param="type"
        placeholder="نوع التصميم"
        value={searchParams.get("type") ?? ""}
        onChange={setParam}
        options={types}
      />
      <FilterSelect
        param="priority"
        placeholder="الأولوية"
        value={searchParams.get("priority") ?? ""}
        onChange={setParam}
        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
      />
      <Button variant="outline" onClick={reset} className="gap-2">
        <RotateCcw className="size-4" />
        إعادة ضبط
      </Button>
    </div>
  );
}
