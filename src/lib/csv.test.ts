import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv — UTF-8 مع BOM (SPEC §12/02)", () => {
  it("يبدأ بـ BOM حتى يفتح عربيًا سليمًا في Excel", () => {
    expect(toCsv(["أ"], [["ب"]]).charCodeAt(0)).toBe(0xfeff);
  });

  it("يهرّب الفواصل والاقتباسات وأسطر جديدة (والفاصلة العربية لا تحتاج تهريبًا)", () => {
    const csv = toCsv(
      ["العنوان", "الوصف"],
      [
        ["text, comma", 'quote "x"'],
        ["سطر\nجديد", "نص، بفاصلة عربية"],
      ],
    );
    expect(csv).toContain('"text, comma"');
    expect(csv).toContain('"quote ""x"""');
    expect(csv).toContain('"سطر\nجديد"');
    expect(csv).toContain("نص، بفاصلة عربية"); // بلا اقتباسات
    expect(csv).not.toContain('"نص، بفاصلة عربية"');
  });

  it("فواصل أسطر CRLF بين الصفوف وقيم فارغة تصبح خلايا فارغة", () => {
    const csv = toCsv(["أ", "ب"], [["1", null], [undefined, "2"]]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toEqual(["أ,ب", "1,", ",2"]);
  });
});
