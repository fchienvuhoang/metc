import Image from "next/image";

export function BrandLogo({ className = "h-16 w-16", priority = false }: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/mettacitta-logo.png"
      alt="Logo MettaCitta"
      width={128}
      height={128}
      priority={priority}
      className={`shrink-0 rounded-full object-contain ${className}`}
    />
  );
}
