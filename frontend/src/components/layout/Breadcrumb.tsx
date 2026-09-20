import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav className={`flex items-center space-x-2 text-sm ${className}`} aria-label="Breadcrumb">
      <Link
        to="/"
        className="text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="Home"
      >
        <Home className="w-4 h-4" />
      </Link>

      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={index} className="flex items-center space-x-2">
            <ChevronRight className="w-4 h-4 text-slate-600" />
            {item.href && !isLast ? (
              <Link
                to={item.href}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-slate-200 font-medium' : 'text-slate-400'}>
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
