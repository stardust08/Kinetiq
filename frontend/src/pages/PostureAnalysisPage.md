# PostureAnalysisPage Component

## Overview

The `PostureAnalysisPage` is the main orchestrator component for the Clinical Posture Analysis feature. It manages a multi-step workflow that guides users through the entire posture analysis process, from booking selection to results display.

## Features

### Multi-Step Flow

The component implements a 5-step workflow:

1. **select_booking** - User selects a booking with remaining screening counts
2. **instructions** - Display positioning instructions before starting
3. **capturing** - Webcam capture for 10 seconds (450 frames at 30 FPS)
4. **processing** - Calculate clinical metrics from captured frames
5. **results** - Display all 33 clinical metrics and 3D visualization

### URL Parameter Handling

- Supports `bookingId` query parameter for direct navigation
- Example: `/posture-analysis?bookingId=abc-123`
- If bookingId is present, skips booking selection step
- If bookingId is missing, shows booking selection step

### Step Management

- Visual step indicator showing progress
- Smooth transitions between steps
- Ability to cancel at any step
- Error handling with retry capability

### Error Handling

- Displays error messages in a user-friendly format
- Provides retry functionality
- Validates booking selection before proceeding
- Handles missing bookingId gracefully

## Usage

### Basic Usage

```tsx
import PostureAnalysisPage from './pages/PostureAnalysisPage';

// In your router
<Route path="/posture-analysis" element={<PostureAnalysisPage />} />
```

### Navigation Examples

```tsx
// Navigate with bookingId (skips booking selection)
<Link to="/posture-analysis?bookingId=abc-123">
  Start Analysis
</Link>

// Navigate without bookingId (shows booking selection)
<Link to="/posture-analysis">
  Start Analysis
</Link>

// Programmatic navigation
navigate('/posture-analysis?bookingId=abc-123');
```

## Component Structure

```
PostureAnalysisPage
├── Header
│   ├── Title
│   └── Back to Bookings Button
├── Step Indicator
│   ├── Step 1: Select Booking
│   ├── Step 2: Instructions
│   ├── Step 3: Capturing
│   ├── Step 4: Processing
│   └── Step 5: Results
├── Error Display (conditional)
└── Step Content
    ├── BookingSelectionStep (step 1)
    ├── InstructionsPanel (step 2)
    ├── WebcamCapture (step 3)
    ├── Processing Spinner (step 4)
    └── MetricsDisplay (step 5)
```

## State Management

### Local State

- `currentStep`: Current step in the workflow
- `selectedBookingId`: ID of the selected booking
- `error`: Error message to display (if any)

### URL State

- `bookingId`: Query parameter for direct navigation

## Props

This component does not accept any props. All state is managed internally or through URL parameters.

## Events

### User Actions

- **handleBookingSelected**: Called when user selects a booking
- **handleStartCapture**: Called when user clicks "Start Analysis"
- **handleCaptureComplete**: Called when capture is complete
- **handleAnalysisComplete**: Called when analysis is complete
- **handleCancel**: Called when user cancels at any step
- **handleError**: Called when an error occurs
- **handleRetry**: Called when user clicks retry after error
- **handleBackToBookings**: Called when user clicks back button

## Integration Points

### Child Components (To Be Implemented)

1. **BookingSelectionStep** (Task 16.2)
   - Displays available bookings
   - Allows booking selection
   - Shows count information

2. **InstructionsPanel** (Task 16.3)
   - Displays positioning instructions
   - Shows visual guides
   - Provides tips for best results

3. **WebcamCapture** (Task 16.4)
   - Integrates react-webcam
   - Captures frames at 30 FPS
   - Shows pose guide overlay

4. **AnalysisProgress** (Task 16.5)
   - Displays progress bar
   - Shows frame count
   - Shows duration

5. **MetricsDisplay** (Task 16.6)
   - Displays all 33 clinical metrics
   - Shows 3D visualization
   - Provides download/share options

### API Integration (To Be Implemented)

The component will integrate with the following API endpoints:

- `POST /api/posture/start-analysis` - Initialize analysis session
- `POST /api/posture/process-frame` - Process video frames
- `POST /api/posture/finalize-analysis` - Complete analysis and save
- `POST /api/posture/cancel-analysis` - Cancel without count deduction
- `GET /api/posture/validate-booking/{bookingId}` - Validate booking

## Styling

The component uses Tailwind CSS for styling with the following design principles:

- **Colors**: Blue for primary actions, gray for neutral elements
- **Spacing**: Consistent padding and margins using Tailwind scale
- **Responsive**: Mobile-first design with responsive breakpoints
- **Accessibility**: Proper color contrast and focus indicators

### Key Classes

- `min-h-screen bg-gray-50` - Full height with light background
- `max-w-7xl mx-auto` - Centered content with max width
- `bg-white rounded-lg shadow-sm` - Card-style containers
- `bg-blue-600 text-white` - Primary action buttons

## Accessibility

- Proper heading hierarchy (h1, h2)
- Semantic HTML elements
- Accessible button labels
- Keyboard navigation support
- Screen reader friendly

## Testing

### Test Coverage

- ✅ Initial rendering
- ✅ Step indicator display
- ✅ Navigation functionality
- ✅ Instructions step
- ✅ Error handling
- ✅ Step transitions
- ✅ Accessibility
- ✅ URL parameter handling
- ✅ Component placeholders

### Running Tests

```bash
npm test PostureAnalysisPage.test.tsx
```

## Future Enhancements

1. **Progress Persistence**
   - Save progress to localStorage
   - Resume interrupted analyses

2. **Analytics**
   - Track step completion rates
   - Monitor drop-off points

3. **Animations**
   - Smooth step transitions
   - Loading animations

4. **Mobile Optimization**
   - Touch-friendly controls
   - Responsive layout improvements

## Related Components

- `BookingSelectionStep` - Booking selection UI
- `InstructionsPanel` - Instruction display
- `WebcamCapture` - Video capture
- `AnalysisProgress` - Progress indicator
- `MetricsDisplay` - Results display

## Related Hooks

- `usePostureAnalysis` - Analysis state management
- `useWebcam` - Webcam integration
- `useFrameProcessor` - Frame processing

## Related API Services

- `postureApi` - Posture analysis API client

## Notes

### Implementation Status

- ✅ Core component structure
- ✅ Multi-step flow logic
- ✅ URL parameter handling
- ✅ Error handling
- ✅ Step transitions
- ⏳ Child components (Tasks 16.2-16.6)
- ⏳ API integration (Week 2 backend tasks)
- ⏳ Webcam capture (Task 16.4)
- ⏳ Results display (Task 16.6)

### Dependencies

- React Router DOM - For routing and navigation
- React - For component logic
- Tailwind CSS - For styling

### Browser Support

- Modern browsers with webcam support
- getUserMedia API required
- WebRTC support required

## Changelog

### Version 1.0.0 (Current)

- Initial implementation
- Multi-step flow
- URL parameter handling
- Error handling
- Step indicator
- Placeholder content for child components

## License

Part of the Neura-Ai Clinical Posture Analysis Migration project.
