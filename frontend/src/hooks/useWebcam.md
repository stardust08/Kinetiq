# useWebcam Hook

Custom React hook for managing webcam initialization, permissions, and error handling.

## Features

- ✅ Handles webcam initialization and cleanup
- ✅ Manages permission requests and errors
- ✅ Provides webcam ref for react-webcam component
- ✅ Tracks webcam ready state
- ✅ Handles common webcam errors (permission denied, no camera found, etc.)
- ✅ Supports explicit permission checking before showing webcam
- ✅ Automatic cleanup on unmount

## Installation

The hook is already available in the project. Just import it:

```typescript
import { useWebcam } from '../hooks/useWebcam';
```

## Basic Usage

```tsx
import React from 'react';
import Webcam from 'react-webcam';
import { useWebcam } from '../hooks/useWebcam';

function MyComponent() {
  const {
    webcamRef,
    isReady,
    error,
    handleUserMedia,
    handleUserMediaError,
  } = useWebcam();

  return (
    <div>
      {error && (
        <div className="error">
          {error.message}
        </div>
      )}
      
      <Webcam
        ref={webcamRef}
        onUserMedia={handleUserMedia}
        onUserMediaError={handleUserMediaError}
        videoConstraints={{
          width: 1280,
          height: 720,
          facingMode: 'user'
        }}
      />
      
      {isReady && <p>Webcam is ready!</p>}
    </div>
  );
}
```

## Advanced Usage with Permission Check

```tsx
import React, { useEffect } from 'react';
import Webcam from 'react-webcam';
import { useWebcam } from '../hooks/useWebcam';

function MyComponent() {
  const {
    webcamRef,
    isReady,
    error,
    permissionStatus,
    handleUserMedia,
    handleUserMediaError,
    requestPermission,
  } = useWebcam();

  // Check permission on mount
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  if (permissionStatus === 'denied') {
    return (
      <div className="error">
        <h3>Camera Access Denied</h3>
        <p>Please enable camera access in your browser settings.</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="error">
          <strong>{error.type}:</strong> {error.message}
        </div>
      )}
      
      <Webcam
        ref={webcamRef}
        onUserMedia={handleUserMedia}
        onUserMediaError={handleUserMediaError}
      />
      
      {isReady ? (
        <button onClick={() => {
          const screenshot = webcamRef.current?.getScreenshot();
          console.log('Screenshot:', screenshot);
        }}>
          Take Screenshot
        </button>
      ) : (
        <p>Initializing camera...</p>
      )}
    </div>
  );
}
```

## API Reference

### Return Values

| Property | Type | Description |
|----------|------|-------------|
| `webcamRef` | `React.RefObject<Webcam \| null>` | Ref to pass to Webcam component |
| `isReady` | `boolean` | Whether webcam is ready and streaming |
| `error` | `WebcamError \| null` | Current error if any |
| `permissionStatus` | `PermissionStatus` | Current permission status ('prompt', 'granted', 'denied', 'unknown') |
| `handleUserMedia` | `() => void` | Callback for Webcam onUserMedia prop |
| `handleUserMediaError` | `(error: string \| DOMException) => void` | Callback for Webcam onUserMediaError prop |
| `reset` | `() => void` | Reset hook state to initial values |
| `requestPermission` | `() => Promise<boolean>` | Request webcam permissions explicitly |

### Types

#### WebcamError

```typescript
interface WebcamError {
  type: 'permission' | 'not_found' | 'not_readable' | 'overconstrained' | 'unknown';
  message: string;
  originalError?: string | DOMException;
}
```

#### PermissionStatus

```typescript
type PermissionStatus = 'prompt' | 'granted' | 'denied' | 'unknown';
```

## Error Handling

The hook automatically parses and categorizes webcam errors:

| Error Type | Description | User Message |
|------------|-------------|--------------|
| `permission` | User denied camera access | "Camera permission denied. Please allow camera access to continue." |
| `not_found` | No camera device found | "No camera found. Please connect a camera to continue." |
| `not_readable` | Camera in use by another app | "Camera is already in use by another application. Please close other apps using the camera." |
| `overconstrained` | Camera doesn't meet constraints | "Camera does not meet the required specifications. Please try a different camera." |
| `unknown` | Other errors | Custom error message from browser |

## Best Practices

1. **Always handle errors**: Display error messages to users so they know what went wrong
2. **Check permissions early**: Use `requestPermission()` before showing the webcam to provide better UX
3. **Provide fallback UI**: Show appropriate UI when camera is not available
4. **Clean up properly**: The hook automatically cleans up on unmount, but you can call `reset()` manually if needed
5. **Use with react-webcam**: This hook is designed to work with the `react-webcam` library

## Example: Complete Webcam Capture Component

```tsx
import React, { useState } from 'react';
import Webcam from 'react-webcam';
import { useWebcam } from '../hooks/useWebcam';

function WebcamCaptureComponent() {
  const {
    webcamRef,
    isReady,
    error,
    permissionStatus,
    handleUserMedia,
    handleUserMediaError,
    reset,
  } = useWebcam();

  const [screenshot, setScreenshot] = useState<string | null>(null);

  const captureScreenshot = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setScreenshot(imageSrc);
    }
  };

  const handleRetry = () => {
    reset();
    setScreenshot(null);
  };

  if (error) {
    return (
      <div className="error-container">
        <h3>Camera Error</h3>
        <p>{error.message}</p>
        <button onClick={handleRetry}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="webcam-container">
      <div className="webcam-wrapper">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{
            width: 1280,
            height: 720,
            facingMode: 'user'
          }}
          onUserMedia={handleUserMedia}
          onUserMediaError={handleUserMediaError}
        />
        
        {!isReady && (
          <div className="loading-overlay">
            <p>Initializing camera...</p>
          </div>
        )}
      </div>

      {isReady && (
        <div className="controls">
          <button onClick={captureScreenshot}>
            Take Screenshot
          </button>
        </div>
      )}

      {screenshot && (
        <div className="preview">
          <h4>Screenshot Preview</h4>
          <img src={screenshot} alt="Screenshot" />
        </div>
      )}
    </div>
  );
}

export default WebcamCaptureComponent;
```

## Testing

The hook includes comprehensive tests covering:
- Initialization
- Permission handling
- Error scenarios
- State management
- Cleanup

Run tests with:
```bash
npm test -- useWebcam.test.ts
```

## Related

- [usePostureAnalysis](./usePostureAnalysis.ts) - Uses this hook for posture analysis
- [WebcamCapture Component](../components/posture/WebcamCapture.tsx) - Example usage
- [react-webcam](https://www.npmjs.com/package/react-webcam) - Webcam library
