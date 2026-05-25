interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <span className="text-3xl mb-3 opacity-40">{icon}</span>}
      <h3 className="font-display text-display-sm text-ink mb-2">{title}</h3>
      <p className="text-body-sm text-ash max-w-md leading-relaxed">{description}</p>
      {action && (
        <a href={action.href}
          className="mt-4 px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors">
          {action.label}
        </a>
      )}
    </div>
  );
}
