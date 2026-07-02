// التعليقات — من أحداث comment مع إدخال جديد (SPEC §12/04).

import { Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

export interface CommentItem {
  id: number;
  actorName: string | null;
  actorRoleLabel: string;
  body: string;
  createdAt: string;
}

export function CommentsThread({
  requestId,
  comments,
  action,
  disabled,
}: {
  requestId: number;
  comments: CommentItem[];
  action: (formData: FormData) => Promise<void>;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">لا تعليقات بعد</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="bg-navy/10 text-xs font-medium text-navy">
                  {(c.actorName ?? "؟").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {c.actorName ?? "النظام"}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({c.actorRoleLabel})
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatDateTime(c.createdAt)}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!disabled ? (
        <form action={action} className="flex items-end gap-2">
          <input type="hidden" name="requestId" value={requestId} />
          <Textarea
            name="body"
            rows={2}
            required
            maxLength={1000}
            placeholder="اكتب تعليقًا…"
            className="flex-1"
          />
          <Button type="submit" className="gap-2">
            <Send className="size-4 rtl:-scale-x-100" />
            إرسال
          </Button>
        </form>
      ) : null}
    </div>
  );
}
