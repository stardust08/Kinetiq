/**
 * generateGaitReport
 * Triggers client-side PDF generation and downloads the gait analysis report.
 */

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { GaitReportTemplate } from '../components/gait/GaitReportTemplate';
import type { GaitReportData } from '../components/gait/GaitReportTemplate';

export async function generateGaitReport(data: GaitReportData): Promise<void> {
  const doc = createElement(GaitReportTemplate, { data }) as unknown as React.ReactElement<DocumentProps>;
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `neura-ai-gait-report-${data.analysisId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
