import { Activity, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface ScreeningCountBadgeProps {
  totalCount: number;
  usedCount: number;
  remainingCount: number;
  showProgress?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function ScreeningCountBadge({
  totalCount,
  usedCount,
  remainingCount,
  showProgress = true,
  size = 'md',
}: ScreeningCountBadgeProps) {
  const percentage = totalCount > 0 ? (usedCount / totalCount) * 100 : 0;
  
  // Determine color based on remaining count
  const getColorClasses = () => {
    if (remainingCount === 0) {
      return {
        bg: '',
        bgStyle: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' },
        border: '',
        text: 'text-red-400',
        badge: 'text-red-400',
        progressBg: 'bg-red-900/30',
        progressBar: 'bg-red-500',
        icon: AlertCircle,
      };
    } else if (remainingCount <= totalCount * 0.3) {
      return {
        bg: '',
        bgStyle: { background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' },
        border: '',
        text: 'text-orange-400',
        badge: 'text-orange-400',
        progressBg: 'bg-orange-900/30',
        progressBar: 'bg-orange-500',
        icon: AlertTriangle,
      };
    } else {
      return {
        bg: '',
        bgStyle: { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' },
        border: '',
        text: 'text-emerald-400',
        badge: 'text-emerald-400',
        progressBg: 'bg-emerald-900/30',
        progressBar: 'bg-emerald-500',
        icon: CheckCircle,
      };
    }
  };

  const colors = getColorClasses();
  const StatusIcon = colors.icon;
  
  // Responsive size classes with better scaling
  const sizeClasses = {
    sm: {
      container: 'p-2.5',
      icon: 'h-3.5 w-3.5',
      title: 'text-xs',
      counts: 'text-[10px]',
      progressHeight: 'h-1.5',
    },
    md: {
      container: 'p-3',
      icon: 'h-4 w-4',
      title: 'text-sm',
      counts: 'text-xs',
      progressHeight: 'h-2',
    },
    lg: {
      container: 'p-4',
      icon: 'h-5 w-5',
      title: 'text-base',
      counts: 'text-sm',
      progressHeight: 'h-2.5',
    },
  };

  const currentSize = sizeClasses[size];

  return (
    <div
      className={`rounded-lg ${currentSize.container} transition-all duration-200`}
      style={colors.bgStyle}
      role="status"
      aria-label={`Screening assessments: ${remainingCount} of ${totalCount} remaining`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Activity className={`${currentSize.icon} ${colors.badge}`} aria-hidden="true" />
          <StatusIcon className={`${currentSize.icon} ${colors.badge}`} aria-hidden="true" />
        </div>
        <span className={`font-semibold ${colors.text} ${currentSize.title} leading-tight`}>
          AI Screening Assessments
        </span>
      </div>
      
      <div className="space-y-1.5">
        <div className="flex justify-between items-center gap-2">
          <span className={`${currentSize.counts} ${colors.text} font-medium`}>
            <span className="font-bold text-base sm:text-lg">{remainingCount}</span>
            <span className="mx-1">of</span>
            <span className="font-semibold">{totalCount}</span>
            <span className="ml-1">remaining</span>
          </span>
          <span className={`${currentSize.counts} font-semibold ${colors.badge} whitespace-nowrap`}>
            {usedCount} used
          </span>
        </div>
        
        {showProgress && totalCount > 0 && (
          <div className="space-y-1">
            <div className={`w-full ${currentSize.progressHeight} ${colors.progressBg} rounded-full overflow-hidden shadow-inner`}>
              <div 
                className={`h-full ${colors.progressBar} transition-all duration-500 ease-out rounded-full shadow-sm`}
                style={{ width: `${percentage}%` }}
                role="progressbar"
                aria-valuenow={usedCount}
                aria-valuemin={0}
                aria-valuemax={totalCount}
                aria-label={`${usedCount} of ${totalCount} assessments used`}
              />
            </div>
            <div className="flex justify-end">
              <span className={`${currentSize.counts} ${colors.badge} font-medium`}>
                {percentage.toFixed(0)}% used
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
