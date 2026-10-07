import { SectionTitle } from "@/components/ui/Ornaments";

/** Centered, ornamented page title (Adventure) with an optional line beneath. */
export function PageHeader({
  isAdventure,
  title,
  calmTitle,
  subtitle,
}: {
  isAdventure: boolean;
  title: string;
  calmTitle?: string;
  subtitle?: React.ReactNode;
}) {
  if (!isAdventure) {
    return (
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-extrabold" style={{ color: "var(--t-ink)" }}>
          {calmTitle ?? title}
        </h1>
        {subtitle && (
          <p className="m-0 text-sm" style={{ color: "var(--t-ink-soft)" }}>
            {subtitle}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 pt-1 text-center">
      <SectionTitle as="h1" size={28}>
        {title}
      </SectionTitle>
      {subtitle && (
        <p className="m-0 text-[15.5px]" style={{ color: "var(--t-cream)", opacity: 0.8 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
