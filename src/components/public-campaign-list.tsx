import type { BankWorkspace } from "@prisma/client";
import { publicCampaignPath } from "@/lib/workspace";
import { BrandLogo } from "@/components/brand-logo";
import { ArrowRight, HeartHandshake } from "lucide-react";
import { CampaignTransferContent } from "@/components/campaign-transfer-content";
import { connection } from "next/server";
import { getCachedPublicCampaignList } from "@/lib/public-campaign";

export async function PublicCampaignList({ workspace }: { workspace: BankWorkspace }) {
  await connection();
  const campaigns = await getCachedPublicCampaignList(workspace);

  return (
    <div className="min-h-screen bg-[#f7f7f4] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700">
            <BrandLogo className="h-16 w-16 sm:h-20 sm:w-20" priority />
            MettaCitta · {workspace}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
            Các thiện pháp đang thực hiện
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {campaigns.length.toLocaleString("vi-VN")} thiện pháp đang chạy
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
        {campaigns.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2">
            {campaigns.map((campaign) => (
              <article
                key={campaign.code}
                className="flex min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    Đang chạy
                  </span>
                </div>

                <h2 className="mt-4 break-words text-base font-semibold leading-6 text-zinc-950">
                  {campaign.name}
                </h2>
                {campaign.description ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600">
                    {campaign.description}
                  </p>
                ) : null}

                <CampaignTransferContent name={campaign.name} code={campaign.code} />

                <a
                  href={publicCampaignPath(campaign.code, workspace)}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-fit sm:self-start"
                >
                  Xem thiện pháp
                  <ArrowRight className="h-4 w-4" />
                </a>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-md border border-zinc-200 bg-white px-4 py-12 text-center">
            <HeartHandshake className="mx-auto h-6 w-6 text-zinc-400" />
            <p className="mt-3 text-sm text-zinc-500">Hiện chưa có thiện pháp nào đang chạy.</p>
          </section>
        )}
      </main>
    </div>
  );
}
