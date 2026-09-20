/**
 * generatePostureReport
 * Triggers client-side PDF generation and downloads the file.
 */

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import type { ReportData } from '../types/report';
import { PostureReportTemplate } from '../components/PostureReportTemplate';

/**
 * Generate and download a posture analysis PDF report.
 * @param data - Combined analysis + captured frames
 */
export async function generatePostureReport(data: ReportData): Promise<void> {
  // @react-pdf/renderer's strict DocumentProps generic.
  const doc = createElement(PostureReportTemplate, { data }) as unknown as React.ReactElement<DocumentProps>;
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `neura-ai-posture-report-${data.analysis.id}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
