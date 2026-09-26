import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardShell, { card, tableStyle, tdStyle, thStyle } from '../../components/dashboard/DashboardShell';
import { createClinician, getClinicians, getStats, setUserStatus } from '../../api/admin';
import { adminNav } from './navigation';

/** Clinician accounts: create them, see their load, activate or block them. */
export default function AdminCliniciansPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    specialisation: '',
    qualifications: '',
    registrationNo: '',
    yearsExperience: '',
    slotDurationMinutes: '30',
  });
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: clinicians, isLoading } = useQuery({
    queryKey: ['admin', 'clinicians'],
    queryFn: () => getClinicians({ includeInactive: true }),
  });
  const { data: stats } = useQuery({ queryKey: ['admin', 'stats'], queryFn: getStats });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'clinicians'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };

  const create = useMutation({
    mutationFn: () =>
      createClinician({
        name: form.name || undefined,
        phone: form.phone,
        email: form.email || undefined,
        specialisation: form.specialisation || undefined,
        qualifications: form.qualifications || undefined,
        registrationNo: form.registrationNo || undefined,
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
        slotDurationMinutes: form.slotDurationMinutes
          ? Number(form.slotDurationMinutes)
          : undefined,
      }),
    onSuccess: (clinician) => {
      setFeedback(
        `${clinician.name ?? clinician.phone} created. They sign in with their phone number - ask them to set their working hours before you assign bookings.`,
      );
      setShowForm(false);
      setForm({
        name: '',
        phone: '',
        email: '',
        specialisation: '',
        qualifications: '',
        registrationNo: '',
        yearsExperience: '',
        slotDurationMinutes: '30',
      });
      invalidate();
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      setUserStatus(id, status),
    onSuccess: invalidate,
  });

  const field = (
    label: string,
    key: keyof typeof form,
    type = 'text',
    required = false,
  ) => (
    <label style={{ color: '#334155', display: 'grid', fontSize: 12, gap: 4 }}>
      {label}
      {required && <span style={{ color: '#b91c1c' }}> *</span>}
      <input
        type={type}
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        style={{ border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: '7px 9px' }}
      />
    </label>
  );

  return (
    <DashboardShell
      title="Clinicians"
      subtitle={clinicians ? `${clinicians.length} account${clinicians.length === 1 ? '' : 's'}` : undefined}
      nav={adminNav(stats?.bookings.unassigned ?? 0)}
      actions={
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          style={{
            background: '#0e7490',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            padding: '9px 16px',
          }}
        >
          {showForm ? 'Cancel' : 'Add clinician'}
        </button>
      }
    >
      {feedback && (
        <p
          style={{
            background: '#ecfdf5',
            border: '1px solid #6ee7b7',
            borderRadius: 8,
            color: '#065f46',
            fontSize: 13,
            margin: 0,
            padding: '9px 12px',
          }}
        >
          {feedback}
        </p>
      )}

      {showForm && (
        <section style={{ ...card, display: 'grid', gap: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>New clinician</h2>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            The phone number is their login identity and must be unique. Everything else
            they can fill in themselves.
          </p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            {field('Name', 'name')}
            {field('Phone', 'phone', 'tel', true)}
            {field('Email', 'email', 'email')}
            {field('Specialisation', 'specialisation')}
            {field('Qualifications', 'qualifications')}
            {field('Registration number', 'registrationNo')}
            {field('Years of experience', 'yearsExperience', 'number')}
            {field('Slot length (minutes)', 'slotDurationMinutes', 'number')}
          </div>
          <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={!form.phone || create.isPending}
              style={{
                background: form.phone ? '#047857' : '#cbd5e1',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: form.phone ? 'pointer' : 'not-allowed',
                fontSize: 13,
                fontWeight: 600,
                padding: '9px 16px',
              }}
            >
              {create.isPending ? 'Creating…' : 'Create account'}
            </button>
            {create.isError && (
              <span style={{ color: '#b91c1c', fontSize: 13 }}>
                {create.error instanceof Error ? create.error.message : 'Could not create.'}
              </span>
            )}
          </div>
        </section>
      )}

      <section style={{ ...card, overflowX: 'auto' }}>
        {isLoading ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Loading…</p>
        ) : !clinicians?.length ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            No clinicians yet. Without one, bookings cannot be assigned and no screening
            can be supervised.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Clinician</th>
                <th style={thStyle}>Specialisation</th>
                <th style={thStyle}>Registration</th>
                <th style={thStyle}>Upcoming</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Accepting</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {clinicians.map((clinician) => (
                <tr key={clinician.id}>
                  <td style={tdStyle}>
                    <strong>{clinician.name ?? 'Unnamed'}</strong>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{clinician.phone}</div>
                  </td>
                  <td style={tdStyle}>
                    {clinician.clinicianProfile?.specialisation ?? '—'}
                  </td>
                  <td style={tdStyle}>
                    {clinician.clinicianProfile?.registrationNo ?? '—'}
                  </td>
                  <td style={tdStyle}>{clinician.stats?.upcomingBookings ?? 0}</td>
                  <td style={tdStyle}>{clinician.stats?.totalBookings ?? 0}</td>
                  <td style={tdStyle}>
                    {clinician.clinicianProfile?.isAcceptingPatients ? 'Yes' : 'No'}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        background: clinician.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                        borderRadius: 6,
                        color: clinician.status === 'ACTIVE' ? '#166534' : '#991b1b',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                      }}
                    >
                      {clinician.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link
                        to={`/clinician/${clinician.id}/profile`}
                        style={{ color: '#0e7490', fontSize: 12, textDecoration: 'none' }}
                      >
                        Profile
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          toggleStatus.mutate({
                            id: clinician.id,
                            status: clinician.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                          })
                        }
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: clinician.status === 'ACTIVE' ? '#b91c1c' : '#047857',
                          cursor: 'pointer',
                          fontSize: 12,
                          padding: 0,
                        }}
                      >
                        {clinician.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </DashboardShell>
  );
}
