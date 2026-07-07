import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/services/settings";
import { getUser } from "@/services/users";

async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error; // NEXT_REDIRECT وغيره
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // لا نعيد التوجيه إلا لجلسة يقابلها مستخدم فعّال في القاعدة — الجلسة
  // اليتيمة (بعد إعادة البذور مثلًا) تبقى هنا ويستبدلها الدخول الجديد
  const session = await auth();
  if (session?.user) {
    const user = await getUser(Number(session.user.id));
    if (user?.isActive) redirect("/");
  }
  const [{ error }, settingsRow] = await Promise.all([searchParams, getSettings()]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {settingsRow.logoPath ? (
            <span className="mb-4 grid size-16 place-items-center overflow-hidden rounded-2xl bg-navy shadow-sm">
              {/* شعار من الإعدادات — img عادي (خارج تحسين next/image عمدًا) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/api/branding/logo"
                alt={settingsRow.orgName}
                className="size-full object-contain p-1.5"
              />
            </span>
          ) : null}
          <h1 className="text-2xl font-bold text-navy">{settingsRow.orgName}</h1>
          {settingsRow.orgSubtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{settingsRow.orgSubtitle}</p>
          ) : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>تسجيل الدخول</CardTitle>
            <CardDescription>ادخل ببريدك الوظيفي وكلمة المرور</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={login} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  dir="ltr"
                  placeholder="name@cst.gov.sa"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  dir="ltr"
                  required
                  autoComplete="current-password"
                />
              </div>
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  بيانات الدخول غير صحيحة. حاول مرة أخرى.
                </p>
              ) : null}
              <Button type="submit" className="w-full">
                دخول
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
