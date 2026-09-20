import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAnalysisById } from '../api/posture';
import AssessmentDetailView from '../components/posture/AssessmentDetailView';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BackButton } from '../components/layout/BackButton';

export default function AssessmentDetailPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['posture-analysis', analysisId],
    queryFn: () => getAnalysisById(analysisId!),
    enabled: !!analysisId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#030712] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-[#2F86C7] border-t-transparent animate-spin" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-[#030712] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl p-8 text-center"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <h2 className="text-xl font-semibold text-red-400 mb-2">
              Assessment Not Found
            </h2>
            <p className="text-red-400/70 mb-6">
              {error instanceof Error ? error.message : 'Unable to load assessment details'}
            </p>
            <button
              onClick={() => navigate('/assessments')}
              className="px-6 py-2.5 rounded-xl bg-[#2F86C7] text-white font-semibold hover:bg-[#2570a8] transition-colors"
            >
              Back to History
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { label: 'Assessments', href: '/assessments' },
            { label: 'Assessment Details' }
          ]}
          className="mb-4"
        />
        <div className="mb-6">
          <BackButton to="/assessments" label="Back to History" />
        </div>

        <AssessmentDetailView analysis={analysis} />
      </div>
    </div>
  );
}
