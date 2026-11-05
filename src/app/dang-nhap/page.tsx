import { BrandLogo } from "@/components/brand-logo";
import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { isGoogleAuthConfigured, safeRedirectPath } from "@/lib/auth";

type Props = {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Đăng nhập quản trị | MettaCitta",
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6ff] px-4 py-8 text-slate-950">
      <section className="w-full max-w-md rounded-xl border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-950/5">
        <div className="flex items-start gap-3">
          <BrandLogo className="h-20 w-20" priority />
          <div>
            <p className="text-sm font-semibold text-indigo-700">MettaCitta</p>
            <h1 className="text-xl font-semibold">Đăng nhập quản trị</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Đăng nhập bằng tài khoản Google được cấp quyền để quản lý sao kê VIB và các thiện pháp.
            </p>
          </div>
        </div>

        <LoginForm authConfigured={isGoogleAuthConfigured()} nextPath={safeRedirectPath(next)} error={error} />
      </section>
    </main>
  );
}
