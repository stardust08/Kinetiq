/**
 * PostureReportTemplate — @react-pdf/renderer
 * Layout:
 *   Page 1 : Header + Patient Info
 *   Page 2 : Front View  — left col: [Overlay / Captured / Skeleton], right col: Ideal Posture
 *   Page 3 : Side View   — same structure
 *   Page 4 : Back View   — same structure
 *   Page 5 : Posture Measurements (with normal range per metric)
 *   Page 6 : Summary & Recommendations
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { ReportData, CapturedViewFrames, MetricStatus } from '../types/report';
import { buildMetricGroups, buildFlaggedMetrics } from '../utils/reportThresholds';
import {
  buildFlaggedMetricsV2,
  buildMetricGroupsV2,
  buildQualityNotesV2,
  buildUnavailableV2,
} from '../utils/reportV2';

const BRAND = '#0EA5E9';
const BRAND_DARK = '#0369A1';
const GREEN = '#16A34A';
const YELLOW = '#B45309';
const RED = '#DC2626';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica', fontSize: 9, color: '#1F2937',
    backgroundColor: '#FFFFFF',
    paddingTop: 36, paddingBottom: 48, paddingLeft: 32, paddingRight: 32,
  },

  // Header
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    borderBottomWidth: 2, borderBottomColor: BRAND, paddingBottom: 9, marginBottom: 10,
  },
  appName: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: BRAND },
  reportTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827', marginTop: 3 },
  headerMeta: { fontSize: 7.5, color: '#6B7280', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  dateText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151' },

  // Section title
  sectionTitle: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_DARK,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    paddingBottom: 3, marginBottom: 7,
  },

  // Info table
  infoTable: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 3, marginBottom: 14 },
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  infoRowLast: { flexDirection: 'row' },
  infoLabel: {
    width: '32%', paddingTop: 5, paddingBottom: 5, paddingLeft: 7, paddingRight: 7,
    backgroundColor: '#F9FAFB', fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#6B7280',
  },
  infoValue: {
    width: '68%', paddingTop: 5, paddingBottom: 5, paddingLeft: 7, paddingRight: 7,
    fontSize: 7.5, color: '#111827',
  },

  // Per-view page layout 
  viewPageTitle: {
    fontSize: 11, fontFamily: 'Helvetica-Bold', color: BRAND_DARK,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 4, marginBottom: 10,
  },
  viewRow: { flexDirection: 'row', flex: 1 },

  // Left column — 3 stacked images
  leftCol: { width: '52%', paddingRight: 6, flexDirection: 'column' },
  imgBlock: { flex: 1, marginBottom: 6 },
  imgBlockLast: { flex: 1 },
  capturedImg: { width: '100%', height: 196, objectFit: 'cover', borderRadius: 3 },
  imgLabelWrap: {
    marginTop: 3, backgroundColor: '#F3F4F6',
    paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5, borderRadius: 2,
  },
  imgLabel: { fontSize: 7, color: '#374151', textAlign: 'center' },

  // Right column — ideal posture
  rightCol: { width: '48%', paddingLeft: 6 },
  idealWrap: {
    flex: 1, borderWidth: 1, borderColor: '#BAE6FD', borderRadius: 4,
    backgroundColor: '#f0f9ff', overflow: 'hidden',
  },
  idealHeader: {
    backgroundColor: BRAND_DARK, paddingTop: 4, paddingBottom: 4,
    paddingLeft: 6, paddingRight: 6,
  },
  idealHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', textAlign: 'center' },
  idealImg: { width: '100%', flex: 1, objectFit: 'contain' },

  // Metrics table  
  metricsGroup: { marginBottom: 9 },
  groupTitle: {
    fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#374151',
    backgroundColor: '#F9FAFB',
    paddingTop: 3, paddingBottom: 3, paddingLeft: 6, paddingRight: 6, marginBottom: 2,
  },
  metricRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    paddingTop: 2.5, paddingBottom: 2.5, paddingLeft: 6, paddingRight: 6, alignItems: 'center',
  },
  metricLabel: { flex: 2.2, fontSize: 7.5, color: '#374151' },
  metricValue: { flex: 0.8, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#111827', textAlign: 'right' },
  metricRange: { flex: 3, fontSize: 6.5, color: '#6B7280', paddingLeft: 6 },
  badge: {
    flex: 0.9, marginLeft: 5, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4,
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', textAlign: 'center',
  },
  badgeNormal: { backgroundColor: '#DCFCE7', color: GREEN },
  badgeMild: { backgroundColor: '#FEF9C3', color: YELLOW },
  badgeSevere: { backgroundColor: '#FEE2E2', color: RED },
  badgeNeutral: { backgroundColor: '#F3F4F6', color: '#4B5563' },

  // Summary 
  summaryItem: { flexDirection: 'row', marginBottom: 7, paddingLeft: 8 },
  summaryBullet: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND, marginRight: 6 },
  summaryBody: { flex: 1 },
  summaryText: { fontSize: 7.5, color: '#374151' },
  summaryRec: { fontSize: 6.5, color: '#6B7280', marginTop: 2 },
  noFlags: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREEN },
  metricNote: { fontSize: 6, color: '#6B7280', paddingLeft: 6, marginTop: 1, marginBottom: 2 },
  caveatBox: {
    borderWidth: 1, borderColor: '#FCD34D', backgroundColor: '#FFFBEB',
    borderRadius: 3, padding: 6, marginBottom: 9,
  },
  caveatTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#92400E', marginBottom: 2 },
  caveatText: { fontSize: 6.5, color: '#92400E', marginTop: 1 },
  unavailRow: { flexDirection: 'row', marginTop: 2 },
  unavailLabel: { flex: 1.4, fontSize: 6.5, color: '#374151' },
  unavailReason: { flex: 3, fontSize: 6, color: '#6B7280' },

  // Footer 
  footer: {
    position: 'absolute', bottom: 16, left: 32, right: 32,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 5,
  },
  footerText: { fontSize: 7, color: '#9CA3AF' },
});

// Helpers 
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${fmtDate(iso)} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

function Footer({ today }: { today: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Generated by Neura-AI</Text>
      <Text style={s.footerText}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`} />
      <Text style={s.footerText}>{today}</Text>
    </View>
  );
}

/**
 * Every status, not three of five. This previously accepted only Normal/Mild/Severe
 * while the caller passed MetricStatus, so an unmeasured metric fell through the
 * ternary and printed a red "Severe" badge next to a dash.
 */
function Badge({ status }: { status: MetricStatus }) {
  const st =
    status === 'Normal' ? s.badgeNormal
      : status === 'Mild' ? s.badgeMild
        : status === 'Severe' ? s.badgeSevere
          : s.badgeNeutral;
  return <Text style={[s.badge, st]}>{status === 'Ungraded' ? 'No verdict' : status}</Text>;
}

// Per-view page (1 page per pose) 
function ViewPage({
  view, label, frames, idealSrc, today,
}: {
  view: string;
  label: string;
  frames: CapturedViewFrames;
  idealSrc: string;
  today: string;
}) {
  const cols: Array<{ src: string; label: string }> = [
    { src: frames.photoWithOverlay, label: 'Photo + Skeleton + Angles (Overlay)' },
    { src: frames.skeletalAnalysis, label: 'Captured Photo' },
    { src: frames.skeletonOnly, label: 'Skeleton + Angles Only' },
  ];

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.viewPageTitle}>{label.toUpperCase()} VIEW — Captured Posture Frames</Text>

      <View style={s.viewRow}>
        {/* Left column: 3 stacked captured images */}
        <View style={s.leftCol}>
          {cols.map((col, i) => (
            <View key={col.label} style={i < cols.length - 1 ? s.imgBlock : s.imgBlockLast}>
              <Image src={col.src} style={s.capturedImg} />
              <View style={s.imgLabelWrap}>
                <Text style={s.imgLabel}>{col.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Right column: ideal posture reference */}
        <View style={s.rightCol}>
          <View style={s.idealWrap}>
            <View style={s.idealHeader}>
              <Text style={s.idealHeaderText}>IDEAL POSTURE REFERENCE</Text>
            </View>
            <Image src={idealSrc} style={s.idealImg} />
          </View>
        </View>
      </View>

      <Footer today={today} />
    </Page>
  );
}

// Main template 
export function PostureReportTemplate({ data }: { data: ReportData }) {
  const { analysis, capturedFrames, idealFrames } = data;

  /*
    Prefer the v2 payload. The legacy path below reads the flat columns on
    PostureAnalysis, and those are NULL for 25 of the 33 by design - the unit or the
    definition changed, and writing the new number into the old column would corrupt
    every historical trend drawn from it. A PDF built from them prints a page of dashes
    while the measurements sit unread in metricsJson. Pre-rewrite analyses have no
    metricsJson and still need the legacy path, with a banner saying so.
  */
  const payload = analysis.metricsJson ?? null;
  const isV2 = Boolean(payload?.metrics);

  const metricGroups = isV2 ? buildMetricGroupsV2(payload!) : buildMetricGroups(analysis);
  const flagged = isV2 ? buildFlaggedMetricsV2(payload!) : buildFlaggedMetrics(analysis);
  const unavailable = isV2 ? buildUnavailableV2(payload!) : [];
  const qualityNotes = isV2 ? buildQualityNotesV2(payload!, analysis.qualityFlags) : [];
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const infoRows: [string, string][] = [
    ['User ID', analysis.userId],
    ['Booking ID', analysis.bookingId],
    ['Service', analysis.booking?.service?.name ?? 'Posture Analysis'],
    ['Analysis Date & Time', fmtDateTime(analysis.analysisDate)],
    ['Status', analysis.status],
  ];

  const views: Array<'front' | 'leftside' | 'rightside' | 'back'> = ['front', 'leftside', 'rightside', 'back'];
  const VIEW_LABELS: Record<typeof views[number], string> = {
    front: 'Front',
    leftside: 'Left Side',
    rightside: 'Right Side',
    back: 'Back',
  };

  return (
    <Document>

      {/* ── Page 1: Header + Patient Info ── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.appName}>Neura-AI</Text>
            <Text style={s.reportTitle}>Posture Analysis Report</Text>
            <Text style={s.headerMeta}>Booking ID: {analysis.bookingId}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.dateText}>{fmtDate(analysis.analysisDate)}</Text>
            <Text style={s.headerMeta}>Session ID: {analysis.id}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Patient / Session Information</Text>
        <View style={s.infoTable}>
          {infoRows.map(([label, value], i) => (
            <View key={label} style={i < infoRows.length - 1 ? s.infoRow : s.infoRowLast}>
              <Text style={s.infoLabel}>{label}</Text>
              <Text style={s.infoValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Footer today={today} />
      </Page>

      {/* ── Pages 2-4: One page per pose view ── */}
      {views.map(view =>
        capturedFrames[view] ? (
          <ViewPage
            key={view}
            view={view}
            label={VIEW_LABELS[view]}
            frames={capturedFrames[view]!}
            idealSrc={idealFrames[view]}
            today={today}
          />
        ) : null
      )}

      {/* ── Page 5: Posture Measurements with ranges ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>Posture Measurements</Text>

        {/*
          Caveats travel with the numbers. Someone reading a printed PDF cannot ask how
          the capture went, so anything qualifying the measurements has to be on the page.
        */}
        {qualityNotes.length > 0 && (
          <View style={s.caveatBox}>
            <Text style={s.caveatTitle}>Capture quality</Text>
            {qualityNotes.map(note => (
              <Text key={note} style={s.caveatText}>• {note}</Text>
            ))}
          </View>
        )}

        {!isV2 && (
          <View style={s.caveatBox}>
            <Text style={s.caveatTitle}>Superseded measurement method</Text>
            <Text style={s.caveatText}>
              This assessment predates the measurement rewrite. Its values came from a
              calculation that has since been corrected and are not comparable with
              newer assessments.
            </Text>
          </View>
        )}

        {metricGroups.map(group => (
          <View key={group.title} style={s.metricsGroup}>
            <Text style={s.groupTitle}>{group.title}</Text>
            {group.metrics.map(metric => (
              <View key={metric.label}>
                <View style={s.metricRow}>
                  <Text style={s.metricLabel}>{metric.label}</Text>
                  <Text style={s.metricValue}>
                    {typeof metric.value === 'number'
                      ? `${metric.value.toFixed(metric.unit === '' ? 2 : 1)}${metric.unit}`
                      : '—'}
                  </Text>
                  <Text style={s.metricRange}>{metric.range ?? '—'}</Text>
                  <Badge status={metric.status} />
                </View>
                {metric.note && <Text style={s.metricNote}>{metric.note}</Text>}
              </View>
            ))}
          </View>
        ))}

        {/*
          Named, with the reason. A metric this hardware cannot measure is a stated
          limitation; a blank row in the results table reads as a broken report.
        */}
        {unavailable.length > 0 && (
          <View style={s.metricsGroup}>
            <Text style={s.groupTitle}>Not Available With This Capture</Text>
            {unavailable.map(item => (
              <View key={item.label} style={s.unavailRow}>
                <Text style={s.unavailLabel}>{item.label}</Text>
                <Text style={s.unavailReason}>{item.reason}</Text>
              </View>
            ))}
          </View>
        )}

        <Footer today={today} />
      </Page>

      {/* ── Page 6: Summary & Recommendations ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>Summary &amp; Recommendations</Text>
        {flagged.length === 0 ? (
          <Text style={s.noFlags}>
            All measured metrics with a reference range are within it. Metrics shown
            without a verdict were measured but have no range this measurement can
            resolve, and metrics marked unavailable were not measured at all; neither
            is a negative finding.
          </Text>
        ) : (
          flagged.map(item => (
            <View key={item.label} style={s.summaryItem}>
              <Text style={s.summaryBullet}>•</Text>
              <View style={s.summaryBody}>
                <Text style={s.summaryText}>
                  {item.label} ({item.value.toFixed(1)}) {'— '}
                  <Text style={{ fontFamily: 'Helvetica-Bold', color: item.status === 'Mild' ? YELLOW : RED }}>
                    {item.status}
                  </Text>
                </Text>
                <Text style={s.summaryRec}>{item.recommendation}</Text>
              </View>
            </View>
          ))
        )}
        <Footer today={today} />
      </Page>

    </Document>
  );
}
