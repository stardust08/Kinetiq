import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  to?: string;
  label?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * BackButton Component
 * 
 * A reusable back button that navigates to a specific route or goes back in history.
 * 
 * @param to - Optional specific route to navigate to
 * @param label - Optional custom label (defaults to "Back")
 * @param className - Optional additional CSS classes
 * @param onClick - Optional custom click handler (overrides default navigation)
 * 
 * @example
 * // Navigate to specific route
 * <BackButton to="/bookings" label="Back to Bookings" />
 * 
 * // Go back in history
 * <BackButton />
 * 
 * // Custom handler
 * <BackButton onClick={() => console.log('Custom action')} />
 */
export function BackButton({ 
  to, 
  label = 'Back', 
  className = '',
  onClick 
}: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`
        inline-flex items-center gap-2 
        text-[#60b5e8] hover:text-white
        transition-colors cursor-pointer
        ${className}
      `}
    >
      <ArrowLeft className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}
