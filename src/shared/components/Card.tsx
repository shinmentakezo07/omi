"use client";

import { cn } from "@/shared/utils/cn";

type CardSectionProps = React.HTMLAttributes<HTMLDivElement>;
type CardRowProps = React.HTMLAttributes<HTMLDivElement>;
type CardListItemProps = React.HTMLAttributes<HTMLDivElement> & {
  actions?: React.ReactNode;
};

interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  children?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: string;
  action?: React.ReactNode;
  padding?: "none" | "xs" | "sm" | "md" | "lg";
  hover?: boolean;
  className?: string;
}

type CardComponent = ((props: CardProps) => React.ReactNode) & {
  Section: (props: CardSectionProps) => React.ReactNode;
  Row: (props: CardRowProps) => React.ReactNode;
  ListItem: (props: CardListItemProps) => React.ReactNode;
};

const Card = ({
  children,
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  hover = false,
  className,
  ...props
}: CardProps) => {
  const paddings = {
    none: "",
    xs: "p-3",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div
      className={cn(
        "bg-surface",
        "border border-black/5 dark:border-white/5",
        "rounded-lg shadow-sm",
        hover && "hover:shadow-md hover:border-primary/30 transition-all cursor-pointer",
        paddings[padding],
        className
      )}
      {...props}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="rounded-lg bg-bg p-2 text-text-muted">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
              </div>
            )}
            <div>
              {title && <h3 className="font-semibold text-text-main">{title}</h3>}
              {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
};

const CompoundCard = Card as CardComponent;

CompoundCard.Section = function CardSection({ children, className, ...props }: CardSectionProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg",
        "bg-black/[0.02] dark:bg-white/[0.02]",
        "border border-black/5 dark:border-white/5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

CompoundCard.Row = function CardRow({ children, className, ...props }: CardRowProps) {
  return (
    <div
      className={cn(
        "p-3 -mx-3 px-3 transition-colors",
        "border-b border-black/5 dark:border-white/5 last:border-b-0",
        "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

CompoundCard.ListItem = function CardListItem({
  children,
  actions,
  className,
  ...props
}: CardListItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between p-3 -mx-3 px-3",
        "border-b border-black/[0.03] dark:border-white/[0.03] last:border-b-0",
        "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
        "transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
};

export default CompoundCard;
