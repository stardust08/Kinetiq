import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostureAnalysis, Booking } from '../../types';
import AssessmentCard from './AssessmentCard';

interface AssessmentHistoryProps {
  assessments: PostureAnalysis[];
  bookings?: Booking[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

/**
 * AssessmentHistory Component
 * 
 * Displays a paginated list of all user posture assessments with filtering capabilities.
 * 
 * Features:
 * - List all user assessments across bookings
 * - Filter by booking
 * - Filter by date range
 * - Pagination support
 * - Assessment cards with summary info
 * - Navigate to detailed view
 * 
 * @param assessments - Array of posture analyses to display
 * @param bookings - Optional array of bookings for filtering
 * @param isLoading - Loading state indicator
 * @param onLoadMore - Callback for loading more assessments (pagination)
 * @param hasMore - Whether more assessments are available
 */
export default function AssessmentHistory({
  assessments,
  bookings = [],
  isLoading = false,
  onLoadMore,
  hasMore = false,
}: AssessmentHistoryProps) {
  const navigate = useNavigate();
  
  // Filter states
  const [selectedBookingId, setSelectedBookingId] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Pagination state
  const [itemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filter assessments based on selected filters
  const filteredAssessments = useMemo(() => {
    let filtered = [...assessments];
    
    // Filter by booking
    if (selectedBookingId !== 'all') {
      filtered = filtered.filter(a => a.bookingId === selectedBookingId);
    }
    
    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter(a => new Date(a.analysisDate) >= start);
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the entire end date
      filtered = filtered.filter(a => new Date(a.analysisDate) <= end);
    }
    
    // Sort by date (most recent first)
    filtered.sort((a, b) => 
      new Date(b.analysisDate).getTime() - new Date(a.analysisDate).getTime()
    );
    
    return filtered;
  }, [assessments, selectedBookingId, startDate, endDate]);
  
  // Paginate filtered assessments
  const paginatedAssessments = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAssessments.slice(startIndex, endIndex);
  }, [filteredAssessments, currentPage, itemsPerPage]);
  
  const totalPages = Math.ceil(filteredAssessments.length / itemsPerPage);
  
  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
  };
  
  const handleBookingFilterChange = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    handleFilterChange();
  };
  
  const handleStartDateChange = (date: string) => {
    setStartDate(date);
    handleFilterChange();
  };
  
  const handleEndDateChange = (date: string) => {
    setEndDate(date);
    handleFilterChange();
  };
  
  const handleClearFilters = () => {
    setSelectedBookingId('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };
  
  const handleViewDetails = (assessmentId: string) => {
    navigate(`/posture-analysis/${assessmentId}`);
  };
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // Get booking name for an assessment
  const getBookingName = (bookingId: string): string => {
    const booking = bookings.find(b => b.id === bookingId);
    return booking?.service?.name || 'Unknown Service';
  };
  
  if (isLoading && assessments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 className="text-base font-semibold text-white mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="booking-filter" className="block text-sm font-medium text-slate-400 mb-2">Filter by Booking</label>
            <select
              id="booking-filter"
              value={selectedBookingId}
              onChange={(e) => handleBookingFilterChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-slate-200 text-sm cursor-pointer"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <option value="all">All Bookings</option>
              {bookings.map(booking => (
                <option key={booking.id} value={booking.id}>
                  {booking.service?.name || `Booking ${booking.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-slate-400 mb-2">From Date</label>
            <input
              type="date"
              id="start-date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-slate-200 text-sm cursor-pointer"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              id="end-date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-slate-200 text-sm cursor-pointer"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>
        {(selectedBookingId !== 'all' || startDate || endDate) && (
          <div className="mt-4">
            <button onClick={handleClearFilters} className="px-4 py-2 text-sm font-medium text-slate-300 rounded-lg hover:text-white transition-colors cursor-pointer" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Assessment List */}
      {filteredAssessments.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-5xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-slate-200 mb-2">No Assessments Found</h3>
          <p className="text-slate-400">
            {assessments.length === 0
              ? "You haven't completed any posture assessments yet."
              : "No assessments match your current filters."}
          </p>
          {assessments.length === 0 && (
            <button onClick={() => navigate('/posture-analysis')} className="mt-4 px-6 py-2.5 rounded-xl text-white font-semibold transition-colors cursor-pointer" style={{ background: "linear-gradient(135deg, #2F86C7, #1E6FA8)" }}>
              Start Your First Assessment
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedAssessments.map(assessment => (
              <AssessmentCard
                key={assessment.id}
                assessment={assessment}
                bookingName={getBookingName(assessment.bookingId)}
                onViewDetails={() => handleViewDetails(assessment.id)}
              />
            ))}
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center space-x-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Previous
              </button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  // Show first page, last page, current page, and pages around current
                  const showPage = 
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1);
                  
                  const showEllipsis = 
                    (page === 2 && currentPage > 3) ||
                    (page === totalPages - 1 && currentPage < totalPages - 2);
                  
                  if (showEllipsis) {
                    return <span key={page} className="px-2 text-gray-500">...</span>;
                  }
                  
                  if (!showPage) return null;
                  
                  return (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                      style={page === currentPage
                        ? { background: "#2F86C7", color: "#fff", border: "1px solid #2F86C7" }
                        : { background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Next
              </button>
            </div>
          )}
          
          {/* Load More Button (for infinite scroll pattern) */}
          {hasMore && onLoadMore && (
            <div className="flex justify-center">
              <button
                onClick={onLoadMore}
                disabled={isLoading}
                className="px-6 py-3 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                style={{ background: "linear-gradient(135deg, #2F86C7, #1E6FA8)" }}
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
