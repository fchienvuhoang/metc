"use client";

import { Download, Eye, HeartHandshake, Loader2, Search, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadElementAsPng } from "@/lib/download-image";
import type { PublicCampaignData, PublicCampaignTransaction } from "@/lib/public-campaign";
import { redactPhoneNumbers } from "@/lib/privacy";
import { normalizeTransferText } from "@/lib/text";

const MONTHLY_EXPENSE_CAMPAIGN_CODES = new Set(["quy-hang-thang", "quy-nhom-1"]);

const statusLabels = {
  ACTIVE: "Đang chạy",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn tất",
};

const statusClassNames = {
  ACTIVE: "border-rose-200 bg-rose-50 text-rose-700",
  PAUSED: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

export function PublicCampaignView({ data }: { data: PublicCampaignData }) {
  const [query, setQuery] = useState("");
  const [detailTransaction, setDetailTransaction] = useState<PublicCampaignTransaction | null>(null);
  const normalizedQuery = normalizeTransferText(query);
  const showMonthlyExpenses = MONTHLY_EXPENSE_CAMPAIGN_CODES.has(data.code);

  const filteredTransactions = useMemo(() => {
    if (!normalizedQuery) {
      return [...data.transactions].sort(compareTransactionNewestFirst);
    }

    return data.transactions.filter((transaction) => {
      const searchableText = [
        transaction.description,
        transaction.groupedContribution?.title,
        transaction.groupedContribution?.note,
        ...(transaction.groupedContribution?.entries.flatMap((entry) => [entry.donorName, entry.note]) ?? []),
      ].filter(Boolean).join(" ");
      return normalizeTransferText(searchableText).includes(normalizedQuery);
    }).sort(compareTransactionNewestFirst);
  }, [data.transactions, normalizedQuery]);

  return (
    <div className="min-h-screen bg-[#fff8f3] text-zinc-950">
      <header className="relative overflow-hidden border-b border-rose-100 bg-[#fff1ea]">
        <Image
          src="/devas-hero-bg-mobile-v1.png"
          alt=""
          fill
          priority
          sizes="(max-width: 1023px) 100vw, 1px"
          aria-hidden="true"
          className="pointer-events-none object-cover object-center opacity-60 sm:opacity-65 lg:hidden"
        />
        <Image
          src="/devas-hero-bg-v2.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 100vw, 1px"
          aria-hidden="true"
          className="pointer-events-none hidden object-cover object-center lg:block"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-[#fff8f3]/10 to-[#fff1ea]/50 lg:from-white/20 lg:via-[#fff8f3]/35 lg:to-[#fff1ea]/80" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-white/20 lg:from-white/15 lg:via-transparent lg:to-white/15" />

        <div className="relative mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-12 lg:py-14">
          <div>
            <div className="flex items-center gap-4 sm:gap-5">
              <Image
                src="/parami-logo.png"
                alt="Logo Pāramī Group"
                width={112}
                height={112}
                priority
                className="h-20 w-20 shrink-0 rounded-full border-2 border-white object-cover shadow-lg shadow-rose-950/10 lg:h-28 lg:w-28"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-rose-950 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-rose-200" />
                  Thiện pháp <span className="font-mono text-rose-100">{data.code}</span>
                </span>
                <span className={`rounded-full border bg-white/70 px-3 py-1.5 text-xs font-medium backdrop-blur ${statusClassNames[data.status]}`}>
                  {statusLabels[data.status]}
                </span>
              </div>
            </div>

            <div className="mt-7 flex items-start gap-4">
              <span className="hidden rounded-2xl bg-white/70 p-3 text-rose-700 shadow-sm ring-1 ring-rose-100 backdrop-blur sm:block">
                <HeartHandshake className="h-7 w-7" />
              </span>
              <div className="min-w-0 rounded-2xl border border-white/[0.65] bg-white/[0.55] p-4 shadow-lg shadow-rose-950/5 backdrop-blur-[1.5px] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">DĀNA PĀRAMĪ</p>
                <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-tight tracking-[-0.03em] text-rose-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)] lg:text-4xl lg:font-semibold lg:drop-shadow-none">
                  {data.name}
                </h1>
                {data.description ? (
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">{data.description}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-xl shadow-rose-950/5 backdrop-blur">
            <div className="border-b border-rose-100 bg-rose-950 px-5 py-5 text-white">
              <p className="text-xs font-medium uppercase tracking-wider text-rose-200">Tịnh tài hiện còn</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{money(data.balance)}</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-rose-100">
              <HeroStat label="Đã hùn phước" value={money(data.income)} tone="rose" />
              <HeroStat label="Đã cúng dường" value={money(data.expenses)} tone="amber" />
            </div>
            <div className="flex items-center justify-between border-t border-rose-100 px-5 py-3 text-xs text-stone-500">
              <span>Số lượt hùn phước</span>
              <span className="font-semibold text-rose-950">{data.transactionCount.toLocaleString("vi-VN")}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6">
        {showMonthlyExpenses ? (
          <section className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Thống kê thu và chi theo tháng</h2>
              <p className="mt-1 text-xs text-zinc-500">Tổng tịnh tài thu vào và các khoản cúng dường trong từng tháng</p>
            </div>

            {data.monthlyExpenses.length > 0 ? (
              <div className="mt-4 space-y-2">
                {data.monthlyExpenses.map((summary) => (
                  <details key={summary.month} className="group overflow-hidden rounded-md border border-zinc-200">
                  <summary className="flex cursor-pointer list-none flex-col gap-3 bg-zinc-50 px-3 py-3 marker:hidden sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-zinc-900">{monthLabel(summary.month)}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {summary.incomeTransactionCount.toLocaleString("vi-VN")} khoản thu · {summary.transactionCount.toLocaleString("vi-VN")} khoản chi
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 text-right sm:w-auto sm:min-w-72">
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Tổng thu</div>
                        <div className="mt-0.5 whitespace-nowrap font-semibold tabular-nums text-emerald-800">{money(summary.incomeAmount)}</div>
                      </div>
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Tổng chi</div>
                        <div className="mt-0.5 whitespace-nowrap font-semibold tabular-nums text-red-700">{money(summary.amount)}</div>
                      </div>
                    </div>
                  </summary>

                  {summary.transactions.length > 0 ? (
                    <div className="overflow-x-auto border-t border-zinc-200">
                      <table className="w-full min-w-[620px] text-sm">
                      <thead className="bg-white text-xs uppercase text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Ngày</th>
                          <th className="px-3 py-2 text-left">Giao dịch</th>
                          <th className="px-3 py-2 text-right">Số tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {summary.transactions.map((transaction) => (
                          <tr key={transaction.id}>
                            <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-zinc-600">
                              {transactionDateTime(transaction.transactionDate)}
                            </td>
                            <td className="px-3 py-2 align-top text-zinc-800">
                              {redactPhoneNumbers(transaction.description)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right align-top font-semibold tabular-nums text-red-700">
                              {money(transaction.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="border-t border-zinc-200 px-3 py-5 text-center text-sm text-zinc-500">
                      Tháng này chưa có khoản chi.
                    </div>
                  )}
                  </details>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-zinc-200 px-3 py-8 text-center text-sm text-zinc-500">
                Chưa có khoản thu hoặc chi.
              </div>
            )}
          </section>
        ) : null}

        <section className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-sm shadow-emerald-900/20">
                <HeartHandshake className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-emerald-950">Phương danh thí chủ</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  {filteredTransactions.length.toLocaleString("vi-VN")} / {data.transactions.length.toLocaleString("vi-VN")} khoản hùn phước công khai
                </p>
              </div>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo phương danh hoặc nội dung"
                className="w-full rounded-lg border border-emerald-200 bg-emerald-50/30 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2 md:hidden">
            {filteredTransactions.map((transaction, index) => (
              <PublicTransactionCard
                key={transaction.id}
                transaction={transaction}
                index={index + 1}
                onViewDetail={() => setDetailTransaction(transaction)}
              />
            ))}
            {filteredTransactions.length === 0 ? <EmptyState /> : null}
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-xl border border-emerald-200 shadow-sm shadow-emerald-950/5 md:block">
            <div className="max-h-[680px] overflow-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gradient-to-r from-emerald-100 via-emerald-50 to-amber-50 text-[11px] uppercase tracking-[0.1em] text-emerald-900 shadow-sm">
                  <tr>
                    <th className="w-16 px-3 py-3 text-center font-semibold">STT</th>
                    <th className="w-32 px-3 py-3 font-semibold">Ngày</th>
                    <th className="px-3 py-3 font-semibold">Phương danh thí chủ</th>
                    <th className="w-40 px-3 py-3 font-semibold">Loại</th>
                    <th className="w-40 px-3 py-3 text-right font-semibold">Tịnh tài</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100/70 bg-white">
                  {filteredTransactions.map((transaction, index) => (
                    <PublicTransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      index={index + 1}
                      onViewDetail={() => setDetailTransaction(transaction)}
                    />
                  ))}
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      {detailTransaction ? (
        <PublicTransactionDetailModal
          transaction={detailTransaction}
          campaignCode={data.code}
          onClose={() => setDetailTransaction(null)}
        />
      ) : null}
    </div>
  );
}

function PublicTransactionCard({
  transaction,
  index,
  onViewDetail,
}: {
  transaction: PublicCampaignTransaction;
  index: number;
  onViewDetail: () => void;
}) {
  const meta = transactionMeta(transaction);

  return (
    <article className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm shadow-emerald-950/5">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 via-white to-amber-50/70 px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-semibold tabular-nums text-emerald-700 shadow-sm">
            {index}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium tabular-nums text-stone-500">{transactionDateTime(transaction.transactionDate)}</div>
            <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
              {meta.label}
            </div>
          </div>
        </div>
        <div className={`whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-right text-sm font-bold tabular-nums shadow-sm ring-1 ring-inset ring-emerald-100 ${meta.amountClassName}`}>
          {money(meta.amount)}
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words border-t border-emerald-100 px-3 py-3 text-sm font-semibold leading-6 text-zinc-900">
        {redactPhoneNumbers(transaction.description)}
      </p>
      {transaction.groupedContribution ? (
        <div className="px-3 pb-1">
          <GroupedContributionInline transaction={transaction} />
        </div>
      ) : null}
      <div className="px-3 pb-3">
        <TransactionDetailButton transaction={transaction} onClick={onViewDetail} />
      </div>
    </article>
  );
}

function PublicTransactionRow({
  transaction,
  index,
  onViewDetail,
}: {
  transaction: PublicCampaignTransaction;
  index: number;
  onViewDetail: () => void;
}) {
  const meta = transactionMeta(transaction);

  return (
    <tr className="odd:bg-white even:bg-emerald-50/25 transition-colors hover:bg-amber-50/60">
      <td className="px-3 py-3 text-center align-top">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-semibold tabular-nums text-emerald-700 shadow-sm">
          {index}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top text-xs tabular-nums text-stone-500">{transactionDateTime(transaction.transactionDate)}</td>
      <td className="min-w-[360px] px-3 py-3 align-top">
        <div className="whitespace-pre-wrap break-words font-semibold leading-6 text-zinc-900">
          {redactPhoneNumbers(transaction.description)}
        </div>
        <GroupedContributionInline transaction={transaction} />
        <TransactionDetailButton transaction={transaction} onClick={onViewDetail} />
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
          {meta.label}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right align-top">
        <span className={`inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-bold tabular-nums ring-1 ring-inset ring-emerald-100 ${meta.amountClassName}`}>
          {money(meta.amount)}
        </span>
      </td>
    </tr>
  );
}

function EmptyState() {
  return <div className="px-3 py-10 text-center text-sm text-zinc-500">Không có giao dịch phù hợp.</div>;
}

function GroupedContributionInline({ transaction }: { transaction: PublicCampaignTransaction }) {
  const batch = transaction.groupedContribution;
  if (!batch) return null;
  const total = batch.entries.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm shadow-emerald-950/5">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-emerald-50 via-amber-50/60 to-rose-50 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm ring-2 ring-white/80">
            <HeartHandshake className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-emerald-950">{batch.title}</h3>
            <p className="mt-0.5 text-[11px] text-emerald-700">
              {batch.entries.length.toLocaleString("vi-VN")} phương danh · Danh sách hùn gộp
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-white/80 bg-white/80 px-2.5 py-1.5 text-right shadow-sm">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-stone-500">Tổng tịnh tài</div>
          <div className="mt-0.5 whitespace-nowrap text-xs font-bold tabular-nums text-emerald-800 sm:text-sm">{money(total)}</div>
        </div>
      </div>

      {batch.note ? (
        <p className="border-t border-amber-100 bg-amber-50/40 px-3 py-2 text-xs leading-5 text-stone-600">
          {redactPhoneNumbers(batch.note)}
        </p>
      ) : null}

      <div className="divide-y divide-emerald-100/70 border-t border-emerald-100">
        {batch.entries.map((entry, index) => (
          <div key={entry.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2.5 odd:bg-white even:bg-emerald-50/25">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-white text-[11px] font-semibold tabular-nums text-emerald-700 shadow-sm">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="break-words text-sm font-semibold leading-5 text-zinc-900">{redactPhoneNumbers(entry.donorName)}</div>
              {entry.note ? <div className="mt-1 text-xs leading-5 text-stone-500">{redactPhoneNumbers(entry.note)}</div> : null}
            </div>
            <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold tabular-nums text-emerald-800 ring-1 ring-inset ring-emerald-100">
              {money(entry.amount)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TransactionDetailButton({
  transaction,
  onClick,
}: {
  transaction: PublicCampaignTransaction;
  onClick: () => void;
}) {
  const batch = transaction.groupedContribution;

  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-gradient-to-r from-emerald-50 to-amber-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-200"
    >
      <Eye className="h-3.5 w-3.5" />
      {batch
        ? `Xem chi tiết · ${batch.entries.length.toLocaleString("vi-VN")} người`
        : "Xem chi tiết"}
    </button>
  );
}

function PublicTransactionDetailModal({
  transaction,
  campaignCode,
  onClose,
}: {
  transaction: PublicCampaignTransaction;
  campaignCode: string;
  onClose: () => void;
}) {
  const batch = transaction.groupedContribution;
  const meta = transactionMeta(transaction);
  const modalRef = useRef<HTMLElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function downloadImage() {
    if (!modalRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadElementAsPng(modalRef.current, `giao-dich-${transaction.transactionCode}`);
    } catch {
      window.alert("Không thể tạo ảnh giao dịch. Vui lòng thử lại.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-zinc-950/55 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-transaction-detail-title"
        className="max-h-[92vh] w-full max-w-[420px] overflow-y-auto rounded-2xl bg-cover bg-top shadow-2xl"
        style={{ backgroundImage: "url('/transaction-devas-bg-v2.jpg')" }}
      >
        <div className="relative bg-gradient-to-b from-amber-50/10 to-amber-100/25 px-6 pb-8 pt-6 text-center text-amber-950">
          <button
            type="button"
            onClick={onClose}
            data-export-exclude="true"
            aria-label="Đóng chi tiết giao dịch"
            className="absolute right-4 top-4 rounded-full bg-amber-950/20 p-1.5 text-white shadow-sm hover:bg-amber-950/30"
          >
            <X className="h-5 w-5" />
          </button>
          <Image
            src="/parami-logo.png"
            alt="Logo Pāramī Group"
            width={72}
            height={72}
            className="mx-auto h-16 w-16 rounded-full border-2 border-white/80 object-cover shadow-lg shadow-amber-950/20"
          />
          <p id="public-transaction-detail-title" className="mt-3 text-sm font-semibold text-amber-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]">
            Chi tiết giao dịch
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-amber-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)]">
            {money(meta.amount)}
          </p>
          <span className="mt-3 inline-flex rounded-full bg-white/65 px-3 py-1 text-xs font-semibold text-amber-950 shadow-sm backdrop-blur-[1px]">
            {transaction.creditAmount > 0 ? "Tiền vào" : "Tiền ra"}
          </span>
        </div>

        <div className="bg-amber-50/75 px-6 py-5">
          <dl className="space-y-4 text-sm">
            <PublicDetailRow label="Ngày giao dịch" value={transactionDateTime(transaction.transactionDate)} />
            <PublicDetailRow label="Mã giao dịch" value={transaction.transactionCode} mono />
            <PublicDetailRow label="Nội dung" value={redactPhoneNumbers(transaction.description)} stacked highlighted />
            <PublicDetailRow label="Thiện pháp" value={campaignCode} />
          </dl>

          {batch ? (
            <div className="mt-5 border-t border-dashed border-amber-900/15 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-950/55">
                {batch.title} · {batch.entries.length.toLocaleString("vi-VN")} người
              </p>
              {batch.note ? <p className="mt-2 text-xs leading-5 text-amber-950/65">{redactPhoneNumbers(batch.note)}</p> : null}
              <div className="mt-3 space-y-2">
                {batch.entries.map((entry, index) => (
                  <div key={entry.id} className="flex items-start justify-between gap-4 rounded-lg bg-white/45 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="mr-2 text-xs text-amber-950/45">{index + 1}.</span>
                      <span className="break-words font-medium text-amber-950">{redactPhoneNumbers(entry.donorName)}</span>
                      {entry.note ? <p className="mt-1 text-xs text-amber-950/55">{redactPhoneNumbers(entry.note)}</p> : null}
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-amber-950">{money(entry.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mt-5 border-t border-dashed border-zinc-200 pt-4 text-center text-[11px] text-zinc-400">
            Ảnh đối soát giao dịch • Parami
          </p>
          <div data-export-exclude="true" className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={downloadImage}
              disabled={isDownloading}
              className="inline-flex items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-950 disabled:opacity-60"
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isDownloading ? "Đang tạo ảnh..." : "Tải ảnh"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PublicDetailRow({
  label,
  value,
  mono = false,
  stacked = false,
  highlighted = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  stacked?: boolean;
  highlighted?: boolean;
}) {
  if (highlighted) {
    return (
      <div className="rounded-xl border-2 border-amber-500/45 bg-white/80 px-4 py-3 shadow-md shadow-amber-950/10 ring-1 ring-white/70">
        <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">{label}</dt>
        <dd className="mt-2 whitespace-pre-wrap break-words text-left text-base font-bold leading-7 text-amber-950">
          {value}
        </dd>
      </div>
    );
  }

  return (
    <div className={stacked ? "space-y-1.5" : "flex items-start justify-between gap-5"}>
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className={`${stacked ? "whitespace-pre-wrap break-words text-left leading-6" : "break-all text-right"} font-medium text-zinc-900 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: string; tone: "rose" | "amber" }) {
  const color = tone === "rose" ? "text-rose-700" : "text-amber-700";

  return (
    <div className="px-5 py-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold sm:text-base ${color}`}>{value}</div>
    </div>
  );
}

function transactionMeta(transaction: PublicCampaignTransaction) {
  if (transaction.creditAmount > 0) {
    return {
      label: transaction.groupedContribution ? "Hùn phước nộp gộp" : "Hùn phước",
      amount: transaction.creditAmount,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      amountClassName: "text-zinc-950",
    };
  }

  return {
    label: "Cúng dường",
    amount: transaction.debitAmount,
    className: "border-red-200 bg-red-50 text-red-700",
    amountClassName: "text-red-700",
  };
}

function compareTransactionNewestFirst(left: PublicCampaignTransaction, right: PublicCampaignTransaction) {
  const dateDifference = new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
  if (dateDifference !== 0) {
    return dateDifference;
  }

  const createdAtDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return (right.statementRow ?? 0) - (left.statementRow ?? 0);
}

function money(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `Tháng ${month}/${year}`;
}

function transactionDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
