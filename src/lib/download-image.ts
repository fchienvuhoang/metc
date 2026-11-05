import { toPng } from "html-to-image";

export async function downloadElementAsPng(element: HTMLElement, fileName: string) {
  await document.fonts.ready;
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: Math.max(2, Math.min(window.devicePixelRatio, 3)),
    backgroundColor: "#fff7dc",
    filter: (node) =>
      !(node instanceof HTMLElement && node.dataset.exportExclude === "true"),
  });
  const link = document.createElement("a");
  link.download = `${safeFileName(fileName)}.png`;
  link.href = dataUrl;
  link.click();
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "chi-tiet-giao-dich";
}
