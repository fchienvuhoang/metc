import type { Metadata } from "next";
import { ArrowRight, HeartHandshake, Sparkles } from "lucide-react";
import Image from "next/image";
import { connection } from "next/server";
import { getCachedPublicCampaignList } from "@/lib/public-campaign";

export const metadata: Metadata = {
  title: "Các thiện pháp đang thực hiện | Pāramī Group",
  description: "Danh sách các thiện pháp đang được Pāramī Group thực hiện.",
};

export const revalidate = false;

export default async function PublicCampaignListPage() {
  await connection();
  const campaigns = await getCachedPublicCampaignList();

  return (
    <main className="min-h-screen bg-[#fffaf5] px-4 py-6 text-zinc-950 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-[#fff4e7] via-white to-emerald-50 p-5 shadow-lg shadow-amber-950/5 sm:p-8">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <Image
              src="/parami-logo.png"
              alt="Pāramī Group"
              width={112}
              height={112}
              priority
              className="h-24 w-24 shrink-0 rounded-full border-2 border-white object-cover shadow-lg sm:h-28 sm:w-28"
            />
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800">
                <Sparkles className="h-3.5 w-3.5" />
                Pāramī Group
              </div>
              <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-4xl">
                Các thiện pháp đang thực hiện
              </h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-stone-600 sm:mx-0 sm:text-base">
                Kính mời quý thí chủ xem thông tin và danh sách hùn phước công khai của từng thiện pháp.
              </p>
            </div>
          </div>
        </header>

        <section aria-label="Danh sách thiện pháp" className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((campaign) => (
            <article
              key={campaign.code}
              className="flex min-w-0 flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                  <HeartHandshake className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-semibold leading-7 text-zinc-950">{campaign.name}</h2>
                  <p className="mt-1 break-all font-mono text-xs text-zinc-400">{campaign.code}</p>
                </div>
              </div>

              {campaign.description ? (
                <p className="mt-4 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">
                  {campaign.description}
                </p>
              ) : (
                <div className="flex-1" />
              )}

              <a
                href={`/thien-phap/${encodeURIComponent(campaign.code)}`}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Xem thiện pháp
                <ArrowRight className="h-4 w-4" />
              </a>
            </article>
          ))}
        </section>

        {campaigns.length === 0 ? (
          <section className="rounded-2xl border border-stone-200 bg-white px-5 py-14 text-center shadow-sm">
            <HeartHandshake className="mx-auto h-9 w-9 text-stone-300" />
            <h2 className="mt-4 font-semibold text-zinc-800">Chưa có thiện pháp đang chạy</h2>
            <p className="mt-2 text-sm text-stone-500">Danh sách sẽ được cập nhật khi nhóm bắt đầu thiện pháp mới.</p>
          </section>
        ) : null}

        <footer className="pb-4 text-center text-xs text-stone-400">
          Trang công khai chỉ hiển thị thông tin các thiện pháp đang thực hiện.
        </footer>
      </div>
    </main>
  );
}
