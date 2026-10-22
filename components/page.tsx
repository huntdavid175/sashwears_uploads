import { cn } from "@/lib/utils"

/** The page canvas every section sits on: wide, so modules can tile side by side. */
export function Page({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      className={cn("mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 md:gap-5 md:p-6", className)}
      {...props}
    />
  )
}

/** Page title (heavy, condensed), an optional line under it, and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Extra lines under the title (tags, meta). */
  children?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-condensed text-3xl leading-none font-extrabold tracking-tight text-balance md:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">{description}</p>
        )}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
