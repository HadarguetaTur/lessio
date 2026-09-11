/**
 * The heading of a page inside the inbox — lists, broadcasts, a campaign.
 *
 * An h2, because the inbox frame already owns the page's h1 ("Messages"). The
 * broadcast pages each used to render their own PageHeader, which inside the
 * frame would have given the page two top-level headings.
 */
export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
