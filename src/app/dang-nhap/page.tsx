import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { isAdminPasswordConfigured, safeRedirectPath } from "@/lib/auth";

type Props = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Đăng nhập quản trị",
};

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6ff] px-4 py-8 text-slate-950">
      <section className="w-full max-w-md rounded-xl border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-950/5">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Đăng nhập quản trị</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Nhập mật khẩu để quản lý sao kê VIB và các thiện pháp.
            </p>
          </div>
        </div>

        <LoginForm authConfigured={isAdminPasswordConfigured()} nextPath={safeRedirectPath(next)} />
      </section>
    </main>
  );
}
