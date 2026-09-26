import { Link } from 'react-router-dom';
import { useScreeningStore } from '../../store/screeningStore';

/**
 * Tells the patient a clinician is watching this capture, and gives them the way back.
 *
 * Worth its own component for two reasons. It reassures - a patient asked to hold four
 * poses in front of a camera should know somebody is on the other end. And it keeps the
 * call reachable: the capture UI takes the whole viewport, so without this the patient
 * has no obvious route back to the consultation they are still in.
 *
 * Renders nothing for an unsupervised capture, so the three screening pages can mount it
 * unconditionally.
 */
export function SupervisionBanner() {
  const supervised = useScreeningStore((state) => state.supervised);
  const consultationId = useScreeningStore((state) => state.consultationId);

  if (!supervised) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        // The three capture pages are dark; a light banner on them reads as a
        // rendering fault rather than as reassurance.
        background: 'rgba(4,120,87,0.12)',
        border: '1px solid rgba(110,231,183,0.35)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#34d399',
            flexShrink: 0,
          }}
        />
        <span style={{ color: '#6ee7b7', fontSize: 13 }}>
          Your clinician started this screening and is watching the call.
        </span>
      </div>
      {consultationId && (
        <Link
          to={`/consultation/${consultationId}`}
          style={{
            color: '#5eead4',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Back to the call
        </Link>
      )}
    </div>
  );
}

export default SupervisionBanner;
