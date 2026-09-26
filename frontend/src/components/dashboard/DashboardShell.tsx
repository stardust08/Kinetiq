import { Link, useLocation } from 'react-router-dom';
import { useAuthStore, useRoleLabel } from '../../store/authStore';

export interface DashboardNavItem {
  to: string;
  label: string;
  /** Rendered as a count beside the label - a work queue that needs attention. */
  badge?: number;
}

export interface DashboardShellProps {
  title: string;
  subtitle?: string;
  nav: DashboardNavItem[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Chrome shared by the clinician and admin areas.
 *
 * One shell rather than two because the two areas differ in their contents, not their
 * shape, and a clinician who is promoted to admin should not have to relearn where
 * things are.
 */
export function DashboardShell({
  title,
  subtitle,
  nav,
  actions,
  children,
}: DashboardShellProps) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const roleLabel = useRoleLabel();

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header
        style={{
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          padding: '14px 20px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <Link
              to="/"
              style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, textDecoration: 'none' }}
            >
              Neura-AI
            </Link>
            <span style={{ color: '#64748b', fontSize: 13, marginLeft: 10 }}>
              {roleLabel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user?.name && (
              <span style={{ color: '#cbd5e1', fontSize: 13 }}>{user.name}</span>
            )}
            <button
              type="button"
              onClick={logout}
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: 13,
                padding: '6px 12px',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <nav
        style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 20px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
          }}
        >
          {nav.map((item) => {
            const active =
              location.pathname === item.to ||
              (item.to !== '/admin' &&
                item.to !== '/clinician' &&
                location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  alignItems: 'center',
                  borderBottom: active ? '2px solid #0e7490' : '2px solid transparent',
                  color: active ? '#0e7490' : '#475569',
                  display: 'inline-flex',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  gap: 6,
                  padding: '13px 14px',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    style={{
                      background: '#0e7490',
                      borderRadius: 999,
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '1px 7px',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '24px 20px 56px',
          display: 'grid',
          gap: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, margin: 0 }}>{title}</h1>
            {subtitle && (
              <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}

export interface StatTileProps {
  label: string;
  value: number | string;
  hint?: string;
  /** Draws attention when the number is work waiting to be done. */
  emphasis?: 'neutral' | 'attention' | 'good';
}

/** One number, with the sentence that says why it matters. */
export function StatTile({ label, value, hint, emphasis = 'neutral' }: StatTileProps) {
  const colour =
    emphasis === 'attention' ? '#b45309' : emphasis === 'good' ? '#047857' : '#0f172a';
  const background =
    emphasis === 'attention' ? '#fffbeb' : emphasis === 'good' ? '#f0fdf4' : '#fff';
  const border =
    emphasis === 'attention' ? '#fcd34d' : emphasis === 'good' ? '#bbf7d0' : '#e2e8f0';

  return (
    <div
      style={{
        background,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: 16,
        display: 'grid',
        gap: 4,
      }}
    >
      <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>{label}</span>
      <strong style={{ color: colour, fontSize: 26, lineHeight: 1.1 }}>{value}</strong>
      {hint && <span style={{ color: '#94a3b8', fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

export const tileGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 12,
};

export const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 18,
};

export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

export const thStyle: React.CSSProperties = {
  textAlign: 'left',
  color: '#64748b',
  fontSize: 12,
  fontWeight: 600,
  padding: '8px 10px',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};

export const tdStyle: React.CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid #f1f5f9',
  color: '#334155',
};

export default DashboardShell;
