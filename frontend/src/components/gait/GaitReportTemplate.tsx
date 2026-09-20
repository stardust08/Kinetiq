/**
 * GaitReportTemplate — @react-pdf/renderer
 * Layout:
 *   Page 1 : Header + Session Information
 *   Page 2 : Front View    — composite / background / skeleton images
 *   Page 3 : Left Side View
 *   Page 4 : Right Side View
 *   Page 5 : Gait Measurements (32 parameters, grouped)
 *   Page 6 : Summary & Findings
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { GaitFrameSnapshot } from '../../utils/captureGaitSnapshot';

const BRAND      = '#3B82F6';
const BRAND_DARK = '#1D4ED8';
const GREEN      = '#16A34A';
const YELLOW     = '#B45309';
const RED        = '#DC2626';

// ── Styles ────────────────────────────────────────────────────────────────────
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
  appName:     { fontSize: 19, fontFamily: 'Helvetica-Bold', color: BRAND },
  reportTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827', marginTop: 3 },
  headerMeta:  { fontSize: 7.5, color: '#6B7280', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  dateText:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151' },

  // Section title
  sectionTitle: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_DARK,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    paddingBottom: 3, marginBottom: 7,
  },

  // Info table
  infoTable:    { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 3, marginBottom: 14 },
  infoRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  infoRowLast:  { flexDirection: 'row' },
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

  // Left column — 2 stacked landscape images
  leftCol:       { width: '55%', paddingRight: 6, flexDirection: 'column' },
  imgBlock:      { flex: 1, marginBottom: 6 },
  imgBlockLast:  { flex: 1 },
  capturedImg:   { width: '100%', height: 160, objectFit: 'cover', borderRadius: 3 },
  imgLabelWrap: {
    marginTop: 3, backgroundColor: '#F3F4F6',
    paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5, borderRadius: 2,
  },
  imgLabel: { fontSize: 7, color: '#374151', textAlign: 'center' },

  // Right column — skeleton only (tall)
  rightCol: { width: '45%', paddingLeft: 6 },
  skeletonWrap: {
    flex: 1, borderWidth: 1, borderColor: '#1E3A5F', borderRadius: 4,
    backgroundColor: '#0f172a', overflow: 'hidden',
  },
  skeletonHeader: {
    backgroundColor: BRAND_DARK, paddingTop: 4, paddingBottom: 4,
    paddingLeft: 6, paddingRight: 6,
  },
  skeletonHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', textAlign: 'center' },
  skeletonImg: { width: '100%', flex: 1, objectFit: 'contain' },

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
  metricLabel: { flex: 2.5, fontSize: 7.5, color: '#374151' },
  metricValue: { flex: 1, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#111827', textAlign: 'right' },
  metricRange: { flex: 2.5, fontSize: 6.5, color: '#6B7280', paddingLeft: 6 },
  badge: {
    flex: 0.9, marginLeft: 5, borderRadius: 3,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4,
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', textAlign: 'center',
  },
  badgeNormal: { backgroundColor: '#DCFCE7', color: GREEN },
  badgeMild:   { backgroundColor: '#FEF9C3', color: YELLOW },
  badgeSevere: { backgroundColor: '#FEE2E2', color: RED },

  // Summary score banner
  scoreBanner: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
    borderRadius: 6, paddingTop: 10, paddingBottom: 10, marginBottom: 14,
  },
  scoreBox:      { alignItems: 'center' },
  scoreValue:    { fontSize: 22, fontFamily: 'Helvetica-Bold', color: BRAND_DARK },
  scoreUnit:     { fontSize: 8, color: '#6B7280' },
  scoreLabel:    { fontSize: 7.5, color: '#374151', marginTop: 2 },

  // Summary items
  summaryItem: { flexDirection: 'row', marginBottom: 7, paddingLeft: 8 },
  summaryBullet: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND, marginRight: 6 },
  summaryBody:   { flex: 1 },
  summaryText:   { fontSize: 7.5, color: '#374151' },
  noFlags:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREEN },

  // Footer
  footer: {
    position: 'absolute', bottom: 16, left: 32, right: 32,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 5,
  },
  footerText: { fontSize: 7, color: '#9CA3AF' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}
function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${fmtDate(iso)} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

function Footer({ today }: { today: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Generated by Neura-AI</Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`}
      />
      <Text style={s.footerText}>{today}</Text>
    </View>
  );
}

type MetricStatus = 'Normal' | 'Mild' | 'Severe';

function Badge({ status }: { status: MetricStatus }) {
  const st = status === 'Normal' ? s.badgeNormal : status === 'Mild' ? s.badgeMild : s.badgeSevere;
  return <Text style={[s.badge, st]}>{status}</Text>;
}

// ── Per-view page ─────────────────────────────────────────────────────────────
function ViewPage({
  label,
  snapshots,
  today,
}: {
  label: string;
  snapshots: GaitFrameSnapshot;
  today: string;
}) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.viewPageTitle}>{label.toUpperCase()} VIEW — Captured Gait Frames</Text>

      <View style={s.viewRow}>
        {/* Left col: composite + raw background */}
        <View style={s.leftCol}>
          <View style={s.imgBlock}>
            <Image src={snapshots.withOverlay} style={s.capturedImg} />
            <View style={s.imgLabelWrap}>
              <Text style={s.imgLabel}>Body + Skeleton Overlay</Text>
            </View>
          </View>
          <View style={s.imgBlockLast}>
            <Image src={snapshots.backgroundOnly} style={s.capturedImg} />
            <View style={s.imgLabelWrap}>
              <Text style={s.imgLabel}>Captured Video Frame</Text>
            </View>
          </View>
        </View>

        {/* Right col: skeleton only */}
        <View style={s.rightCol}>
          <View style={s.skeletonWrap}>
            <View style={s.skeletonHeader}>
              <Text style={s.skeletonHeaderText}>SKELETON ANALYSIS</Text>
            </View>
            <Image src={snapshots.skeletonOnly} style={s.skeletonImg} />
          </View>
        </View>
      </View>

      <Footer today={today} />
    </Page>
  );
}

// ── Metrics helpers ───────────────────────────────────────────────────────────
interface GaitMetricRow {
  label: string;
  value: number;
  unit: string;
  range: string;
  status: MetricStatus;
}

interface GaitMetricGroup {
  title: string;
  rows: GaitMetricRow[];
}

function classify(value: number, lo: number, hi: number): MetricStatus {
  if (value >= lo && value <= hi) return 'Normal';
  const margin = (hi - lo) * 0.25;
  if (value >= lo - margin && value <= hi + margin) return 'Mild';
  return 'Severe';
}

function buildGaitMetricGroups(m: Record<string, number>): GaitMetricGroup[] {
  return [
    {
      title: 'I. Temporal Parameters',
      rows: [
        { label: 'Cadence',               value: m.cadence,             unit: 'steps/min', range: '100–120',    status: classify(m.cadence, 100, 120) },
        { label: 'Stride Time (Left)',     value: m.strideTimeLeft,      unit: 's',         range: '0.98–1.07',  status: classify(m.strideTimeLeft, 0.98, 1.07) },
        { label: 'Stride Time (Right)',    value: m.strideTimeRight,     unit: 's',         range: '0.98–1.07',  status: classify(m.strideTimeRight, 0.98, 1.07) },
        { label: 'Stance Phase',           value: m.stancePhasePercent,  unit: '%',         range: '58–62%',     status: classify(m.stancePhasePercent, 58, 62) },
        { label: 'Swing Phase',            value: m.swingPhasePercent,   unit: '%',         range: '38–42%',     status: classify(m.swingPhasePercent, 38, 42) },
        { label: 'Double Support Time',    value: m.doubleSupportTime,   unit: 's',         range: '0.10–0.14',  status: classify(m.doubleSupportTime, 0.10, 0.14) },
      ],
    },
    {
      title: 'II. Spatial Parameters',
      rows: [
        { label: 'Stride Length',          value: m.strideLength,        unit: 'norm',      range: '—',          status: 'Normal' },
        { label: 'Step Length (Left)',      value: m.stepLengthLeft,      unit: 'norm',      range: '—',          status: 'Normal' },
        { label: 'Step Length (Right)',     value: m.stepLengthRight,     unit: 'norm',      range: '—',          status: 'Normal' },
        { label: 'Step Width',             value: m.stepWidth,           unit: 'norm',      range: '—',          status: 'Normal' },
        { label: 'Walking Speed',          value: m.walkingSpeed,        unit: 'norm/s',    range: '—',          status: 'Normal' },
        { label: 'Step Length Symmetry',   value: m.stepLengthSymmetry,  unit: '%',         range: '>95%',        status: classify(m.stepLengthSymmetry, 95, 100) },
      ],
    },
    {
      title: 'III. Kinematic Parameters',
      rows: [
        { label: 'Hip Flexion Max',        value: m.hipFlexionMax,       unit: '°',         range: '20–30°',     status: classify(m.hipFlexionMax, 20, 30) },
        { label: 'Hip Extension Max',      value: m.hipExtensionMax,     unit: '°',         range: '10–20°',     status: classify(m.hipExtensionMax, 10, 20) },
        { label: 'Hip Flexion ROM',        value: m.hipFlexionRom,       unit: '°',         range: '40–50°',     status: classify(m.hipFlexionRom, 40, 50) },
        { label: 'Knee Flexion Max',       value: m.kneeFlexionMax,      unit: '°',         range: '55–65°',     status: classify(m.kneeFlexionMax, 55, 65) },
        { label: 'Knee Extension Min',     value: m.kneeExtensionMin,    unit: '°',         range: '—',          status: 'Normal' },
        { label: 'Knee Flexion ROM',       value: m.kneeFlexionRom,      unit: '°',         range: '—',          status: 'Normal' },
        { label: 'Left Knee Angle (avg)',  value: m.leftKneeAngleAvg,    unit: '°',         range: '—',          status: 'Normal' },
        { label: 'Right Knee Angle (avg)', value: m.rightKneeAngleAvg,   unit: '°',         range: '—',          status: 'Normal' },
        { label: 'Ankle Dorsiflexion Max', value: m.ankleDorsiflexionMax, unit: '°',        range: '10–15°',     status: classify(m.ankleDorsiflexionMax, 10, 15) },
        { label: 'Foot Progression (L)',   value: m.footProgressionAngleLeft,  unit: '°',   range: '5–15°',      status: classify(m.footProgressionAngleLeft, 5, 15) },
        { label: 'Foot Progression (R)',   value: m.footProgressionAngleRight, unit: '°',   range: '5–15°',      status: classify(m.footProgressionAngleRight, 5, 15) },
        { label: 'Arm Swing Amplitude',    value: m.armSwingAmplitude,   unit: 'norm',      range: '—',          status: 'Normal' },
      ],
    },
    {
      title: 'IV. Trunk & Pelvis',
      rows: [
        { label: 'Trunk Lateral Sway',     value: m.trunkLateralSway,    unit: 'norm',      range: '—',          status: 'Normal' },
        { label: 'Trunk Sagittal Lean',    value: m.trunkSagittalLean,   unit: '°',         range: '0–5°',       status: classify(m.trunkSagittalLean, 0, 5) },
        { label: 'Pelvic Obliquity Range', value: m.pelvicObliquityRange, unit: '°',        range: '4–6°',       status: classify(m.pelvicObliquityRange, 4, 6) },
        { label: 'Arm Swing Symmetry',     value: m.armSwingSymmetry,    unit: '%',         range: '>90%',       status: classify(m.armSwingSymmetry, 90, 100) },
      ],
    },
    {
      title: 'V. Functional Scores',
      rows: [
        { label: 'Gait Symmetry Index',    value: m.gaitSymmetryIndex,   unit: '%',         range: '>95%',       status: classify(m.gaitSymmetryIndex, 95, 100) },
        { label: 'Step Regularity',        value: m.stepRegularity,      unit: '(0–1)',     range: '>0.85',      status: classify(m.stepRegularity, 0.85, 1) },
        { label: 'Gait Quality Score',     value: m.gaitQualityScore,    unit: '/100',      range: '—',          status: 'Normal' },
        { label: 'Gait Cycles Analyzed',   value: m.gaitCycleCount,      unit: 'cycles',    range: '—',          status: 'Normal' },
      ],
    },
  ];
}

// ── Public types ──────────────────────────────────────────────────────────────
export interface GaitReportData {
  analysisId: string;
  bookingId: string;
  userId?: string;
  analysisDate: string;
  metrics: Record<string, number>;
  capturedSnapshots: {
    front?: GaitFrameSnapshot;
    leftside?: GaitFrameSnapshot;
    rightside?: GaitFrameSnapshot;
  };
}

// ── Main template ─────────────────────────────────────────────────────────────
export function GaitReportTemplate({ data }: { data: GaitReportData }) {
  const { analysisId, bookingId, userId, analysisDate, metrics, capturedSnapshots } = data;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const metricGroups = buildGaitMetricGroups(metrics);

  const infoRows: [string, string][] = [
    ['Analysis ID', analysisId],
    ['Booking ID',  bookingId],
    ...(userId ? [['User ID', userId] as [string, string]] : []),
    ['Service',     'Gait Analysis'],
    ['Analysis Date & Time', fmtDateTime(analysisDate)],
    ['Gait Quality Score',
      typeof metrics.gaitQualityScore === 'number'
        ? `${metrics.gaitQualityScore.toFixed(0)} / 100`
        : 'Not measured'],
  ];

  const views: Array<{ key: 'front' | 'leftside' | 'rightside'; label: string }> = [
    { key: 'front',     label: 'Front' },
    { key: 'leftside',  label: 'Left Side' },
    { key: 'rightside', label: 'Right Side' },
  ];

  // Flagged metrics (Mild or Severe, excluding spatial/raw values with no range)
  const flagged = metricGroups
    .flatMap(g => g.rows)
    .filter(r => r.status !== 'Normal' && r.range !== '—');

  return (
    <Document>

      {/* ── Page 1: Header + Session Info ── */}
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.appName}>Neura-AI</Text>
            <Text style={s.reportTitle}>Gait Analysis Report</Text>
            <Text style={s.headerMeta}>Booking ID: {bookingId}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.dateText}>{fmtDate(analysisDate)}</Text>
            <Text style={s.headerMeta}>Analysis ID: {analysisId}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Session Information</Text>
        <View style={s.infoTable}>
          {infoRows.map(([label, value], i) => (
            <View key={label} style={i < infoRows.length - 1 ? s.infoRow : s.infoRowLast}>
              <Text style={s.infoLabel}>{label}</Text>
              <Text style={s.infoValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Quick score banner */}
        <Text style={s.sectionTitle}>Overview</Text>
        <View style={s.scoreBanner}>
          <View style={s.scoreBox}>
            <Text style={s.scoreValue}>
              {typeof metrics.gaitQualityScore === 'number'
                ? metrics.gaitQualityScore.toFixed(0)
                : '—'}
            </Text>
            <Text style={s.scoreUnit}>/100</Text>
            <Text style={s.scoreLabel}>Gait Quality Score</Text>
          </View>
          <View style={s.scoreBox}>
            <Text style={s.scoreValue}>
              {typeof metrics.gaitSymmetryIndex === 'number'
                ? `${metrics.gaitSymmetryIndex.toFixed(1)}%`
                : '—'}
            </Text>
            <Text style={s.scoreLabel}>Symmetry Index</Text>
          </View>
          <View style={s.scoreBox}>
            <Text style={s.scoreValue}>
              {typeof metrics.cadence === 'number' ? metrics.cadence.toFixed(0) : '—'}
            </Text>
            <Text style={s.scoreUnit}>steps/min</Text>
            <Text style={s.scoreLabel}>Cadence</Text>
          </View>
          <View style={s.scoreBox}>
            <Text style={s.scoreValue}>{Math.round(metrics.gaitCycleCount ?? 0)}</Text>
            <Text style={s.scoreUnit}>cycles</Text>
            <Text style={s.scoreLabel}>Gait Cycles</Text>
          </View>
        </View>

        <Footer today={today} />
      </Page>

      {/* ── Pages 2–4: One page per captured view ── */}
      {views.map(({ key, label }) =>
        capturedSnapshots[key] ? (
          <ViewPage
            key={key}
            label={label}
            snapshots={capturedSnapshots[key]!}
            today={today}
          />
        ) : null
      )}

      {/* ── Page 5: Gait Measurements ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>Gait Measurements</Text>
        {metricGroups.map(group => (
          <View key={group.title} style={s.metricsGroup}>
            <Text style={s.groupTitle}>{group.title}</Text>
            {group.rows.map(row => (
              <View key={row.label} style={s.metricRow}>
                <Text style={s.metricLabel}>{row.label}</Text>
                <Text style={s.metricValue}>
                  {typeof row.value === 'number' ? row.value.toFixed(2) : '—'} {row.unit}
                </Text>
                <Text style={s.metricRange}>{row.range}</Text>
                <Badge status={row.status} />
              </View>
            ))}
          </View>
        ))}
        <Footer today={today} />
      </Page>

      {/* ── Page 6: Summary & Findings ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>Summary &amp; Findings</Text>
        {flagged.length === 0 ? (
          <Text style={s.noFlags}>All measured gait metrics are within normal clinical ranges.</Text>
        ) : (
          flagged.map(item => (
            <View key={item.label} style={s.summaryItem}>
              <Text style={s.summaryBullet}>•</Text>
              <View style={s.summaryBody}>
                <Text style={s.summaryText}>
                  {item.label} —{' '}
                  {typeof item.value === 'number' ? item.value.toFixed(2) : 'not measured'}{' '}
                  {item.unit}{' '}
                  (Normal: {item.range}){' '}
                  <Text style={{ fontFamily: 'Helvetica-Bold', color: item.status === 'Mild' ? YELLOW : RED }}>
                    [{item.status}]
                  </Text>
                </Text>
              </View>
            </View>
          ))
        )}
        <Footer today={today} />
      </Page>

    </Document>
  );
}
