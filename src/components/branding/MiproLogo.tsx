import clsx from "clsx";

type MiproLogoProps = {
  className?: string;
  priority?: boolean;
};

export default function MiproLogo({ className, priority = false }: MiproLogoProps) {
  return (
    <span className={clsx("block shrink-0 overflow-hidden bg-white", className)}>
      <img
        className="block h-auto w-full"
        src="/mipro-logo.png"
        alt="MIPRO - Precision in Healthcare"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  );
}
