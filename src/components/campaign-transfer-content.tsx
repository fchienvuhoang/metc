"use client";

import { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { campaignTransferContent } from "@/lib/campaign-transfer";

export function CampaignTransferContent({ name, code }: { name: string; code: string }) {
  const content = campaignTransferContent(name, code);
  const [copiedContent, setCopiedContent] = useState("");
  const [error, setError] = useState(false);
  const copied = copiedContent === content;

  async function copyContent() {
    setError(false);
    try {
      await navigator.clipboard.writeText(content);
      setCopiedContent(content);
    } catch {
      setCopiedContent("");
      setError(true);
    }
  }

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">Nội dung chuyển khoản</h3>
        <button type="button" onClick={copyContent} className="inline-flex items-center gap-2 rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800">
          {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Đã sao chép" : "Sao chép nội dung"}
        </button>
      </div>
      <p className="mt-3 select-all break-words rounded-md border border-amber-200 bg-white p-3 text-sm leading-6 text-zinc-800">{content}</p>
      <p className="mt-2 text-xs text-zinc-500">Vui lòng giữ nguyên mã thiện pháp ở cuối nội dung khi chuyển khoản.</p>
      <p role="status" className="mt-2 text-xs text-zinc-600">
        {error ? "Không thể tự động sao chép. Bạn có thể chọn nội dung trong khung và sao chép thủ công." : copied ? "Đã sao chép nội dung chuyển khoản." : ""}
      </p>
    </section>
  );
}
