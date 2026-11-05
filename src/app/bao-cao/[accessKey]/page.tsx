import { ExternalLink, Landmark, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ReadonlyLoginForm } from "@/components/readonly-login-form";
import {
  isReadonlyDashboardConfigured,
  READONLY_SESSION_COOKIE,
  verifyReadonlyAccessKey,
  verifyReadonlySessionToken,
} from "@/lib/readonly-auth";
import { getReadonlyDashboardData } from "@/lib/readonly-dashboard";

export const dynamic = "force-dynamic";

export default async function ReadonlyDashboardPage({ params }: { params: Promise<{ accessKey: string }> }) {
  const { accessKey } = await params;
  if (!isReadonlyDashboardConfigured() || !verifyReadonlyAccessKey(accessKey)) notFound();

  const cookieStore = await cookies();
  const authenticated = await verifyReadonlySessionToken(
    cookieStore.get(READONLY_SESSION_COOKIE)?.value,
    accessKey,
  );

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10 text-zinc-950">
        <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-950/5">
          <div className="flex items-center gap-4">
            <Image src="/parami-logo.png" alt="Pāramī Group" width={72} height={72} className="h-16 w-16 rounded-full" priority />
            <div>
              <div className="flex items-center gap-2 text-emerald-700"><LockKeyhole className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wider">Chỉ đọc</span></div>
              <h1 className="mt-1 text-xl font-semibold">Báo cáo thiện pháp</h1>
              <p className="mt-1 text-sm text-zinc-500">Nhập mật khẩu để xem số liệu tổng hợp.</p>
            </div>
          </div>
          <ReadonlyLoginForm accessKey={accessKey} />
        </section>
      </main>
    );
  }

  const data = await getReadonlyDashboardData();
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-zinc-950 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <Image src="/parami-logo.png" alt="Pāramī Group" width={80} height={80} className="h-16 w-16 rounded-full sm:h-20 sm:w-20" priority />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Báo cáo chỉ đọc</p>
            <h1 className="mt-1 text-2xl font-semibold">Tổng quan thiện pháp</h1>
            <p className="mt-1 text-sm text-zinc-500">Không thể thêm, chỉnh sửa hoặc xóa dữ liệu tại trang này.</p>
          </div>
        </header>

        {data.map((summary) => (
          <section key={summary.workspace} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="grid gap-4 border-b border-stone-200 bg-stone-100/70 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><Landmark className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-lg font-semibold">Ngân hàng {summary.workspace}</h2>
                  <p className="text-sm text-zinc-500">
                    {summary.account ? `${summary.account.accountNumber}${summary.account.accountName ? ` · ${summary.account.accountName}` : ""}` : "Chưa có tài khoản"}
                  </p>
                </div>
              </div>
              <SummaryStat label="Tổng thu" value={money(summary.totalIncome)} />
              <SummaryStat label="Số dư tài khoản" value={money(summary.account?.currentBalance ?? 0)} accent />
            </div>

            <div className="divide-y divide-stone-100 md:hidden">
              {summary.campaigns.map((campaign) => (
                <article key={campaign.code} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-medium leading-6 text-zinc-950">{campaign.name}</h3>
                      <p className="mt-1 break-all font-mono text-xs text-zinc-500">{campaign.code}</p>
                    </div>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-3">
                    <div><div className="text-xs text-zinc-500">Số giao dịch</div><div className="mt-1 font-semibold tabular-nums">{campaign.transactionCount.toLocaleString("vi-VN")}</div></div>
                    <div className="text-right"><div className="text-xs text-zinc-500">Tổng thu</div><div className="mt-1 font-semibold text-emerald-700">{money(campaign.income)}</div></div>
                  </div>
                  <a href={`/thien-phap/${encodeURIComponent(campaign.code)}`} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">Mở trang công khai <ExternalLink className="h-4 w-4" /></a>
                </article>
              ))}
              {summary.campaigns.length === 0 ? <div className="px-5 py-10 text-center text-zinc-500">Chưa có thiện pháp.</div> : null}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white text-xs uppercase text-zinc-500">
                  <tr><th className="px-5 py-3">Thiện pháp</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Số giao dịch</th><th className="px-5 py-3 text-right">Tổng thu</th><th className="px-5 py-3 text-right">Công khai</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {summary.campaigns.map((campaign) => (
                    <tr key={campaign.code} className="hover:bg-stone-50">
                      <td className="max-w-md px-5 py-3"><div className="break-words font-medium leading-6">{campaign.name}</div><div className="mt-0.5 break-all font-mono text-xs text-zinc-500">{campaign.code}</div></td>
                      <td className="px-5 py-3"><StatusBadge status={campaign.status} /></td>
                      <td className="px-5 py-3 text-right tabular-nums">{campaign.transactionCount.toLocaleString("vi-VN")}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700">{money(campaign.income)}</td>
                      <td className="px-5 py-3 text-right"><a href={`/thien-phap/${encodeURIComponent(campaign.code)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Mở link <ExternalLink className="h-3.5 w-3.5" /></a></td>
                    </tr>
                  ))}
                  {summary.campaigns.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500">Chưa có thiện pháp.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function SummaryStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="sm:text-right"><div className="text-xs text-zinc-500">{label}</div><div className={`mt-1 text-lg font-semibold ${accent ? "text-emerald-700" : "text-zinc-950"}`}>{value}</div></div>;
}

function StatusBadge({ status }: { status: "ACTIVE" | "PAUSED" | "COMPLETED" }) {
  const labels = { ACTIVE: "Đang chạy", PAUSED: "Tạm dừng", COMPLETED: "Hoàn tất" };
  const classes = status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : status === "PAUSED" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-600";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{labels[status]}</span>;
}

function money(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);
}
