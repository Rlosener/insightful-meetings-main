import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  badge?: string;
}

const PageHeader = ({ title, description, actions, badge }: PageHeaderProps) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {badge && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {badge}
          </span>
        )}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

export default PageHeader;
