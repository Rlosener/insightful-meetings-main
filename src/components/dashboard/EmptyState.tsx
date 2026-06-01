import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  children?: ReactNode;
}

const EmptyState = ({ icon: Icon, title, description, action, children }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 rounded-xl border border-dashed border-border bg-muted/30">
    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
      <Icon className="h-6 w-6 text-muted-foreground" />
    </div>
    <h3 className="font-display font-semibold text-sm mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground text-center max-w-sm">{description}</p>
    {action && (
      <Button variant="default" size="sm" className="mt-4" onClick={action.onClick}>
        {action.label}
      </Button>
    )}
    {children}
  </div>
);

export default EmptyState;
