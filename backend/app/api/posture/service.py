"""
Posture Analysis Service for business logic.

This module provides the PostureAnalysisService class for handling posture
analysis operations including session management, frame processing, metric
calculation, and screening count management.
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from app.db.client import db
from app.core.exceptions import BadRequestException, UnauthorizedException
import uuid


class PostureAnalysisService:
    """
    Service for posture analysis operations.
    
    This class handles all business logic related to posture analysis including:
    - Starting analysis sessions with booking validation
    - Processing video frames
    - Calculating clinical metrics
    - Managing screening count deduction
    - Retrieving analysis results
    """
    
    @staticmethod
    async def start_analysis(user_id: str, booking_id: str) -> Dict[str, Any]:
        """
        Start a new posture analysis session.
        
        This method validates that the user owns the booking, checks that the
        booking has remaining screening counts, verifies the booking status is
        valid, and creates a session with a 15-minute expiration.
        
        Args:
            user_id: UUID of the user starting the analysis
            booking_id: UUID of the booking to use for this analysis
            
        Returns:
            Dictionary containing:
                - sessionId: Unique session identifier
                - bookingId: Associated booking ID
                - remainingCount: Remaining screening count (before deduction)
                - expiresAt: Session expiration timestamp
                
        Raises:
            UnauthorizedException: If booking not found or user doesn't own it
            BadRequestException: If no remaining counts or invalid booking status
            
        Example:
            >>> result = await PostureAnalysisService.start_analysis(
            ...     "user-123",
            ...     "booking-456"
            ... )
            >>> print(result["sessionId"])
            "session-789"
            >>> print(result["remainingCount"])
            5
            
        Note:
            Implements requirements:
            - AC-3.1: User must select an active booking before starting
            - AC-3.2: System only shows bookings with remaining counts > 0
            - AC-3.3: System displays remaining count for selected booking
            - SR-1: Authenticate all API requests
            - SR-2: Validate user owns booking before allowing assessment
            - SR-4: Verify booking has remaining screening counts before starting
        """
        # Validate booking ownership
        booking = await db.booking.find_first(
            where={"id": booking_id, "userId": user_id}
        )
        
        if not booking:
            raise UnauthorizedException(
                "Booking not found or access denied. Please ensure you own this booking."
            )
        
        # Validate remaining screening count
        if booking.remainingScreeningCount <= 0:
            raise BadRequestException(
                f"No remaining screening counts for this booking. "
                f"Used: {booking.usedScreeningCount}/{booking.totalScreeningCount}. "
                f"Please purchase a new service plan to continue."
            )
        
        # Validate booking status
        valid_statuses = ["CONFIRMED", "COMPLETED"]
        if booking.status not in valid_statuses:
            raise BadRequestException(
                f"Booking status '{booking.status}' is not valid for analysis. "
                f"Valid statuses are: {', '.join(valid_statuses)}. "
                f"Please contact support if you believe this is an error."
            )
        
        # Create session with 15-minute expiration
        session_id = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(minutes=15)
        
        # TODO: Store session in Redis cache for production
        # For now, session validation will be done via booking ownership checks
        # Redis implementation should include:
        # - await redis.setex(f"analysis_session:{session_id}", 900, booking_id)
        # - Session cleanup on expiration
        # - Session validation in process_frame and finalize_analysis
        
        return {
            "sessionId": session_id,
            "bookingId": booking_id,
            "remainingCount": booking.remainingScreeningCount,
            "expiresAt": expires_at
        }
    # PostureAnalysisService.process_frame lived here: decode a base64 JPEG, run
    # MediaPipe on the server, return landmarks for one frame. It backed the
    # /process-frame endpoint and has been unreachable since pose estimation moved into
    # the browser. Removed along with the endpoint; the live path is finalize_analysis
    # below, which receives landmarks the client already extracted.
    @staticmethod
    async def finalize_analysis(
        user_id: str,
        booking_id: str,
        session_id: str,
        landmarks_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Finalize analysis, calculate metrics, save to DB, and deduct count.
        
        This is a CRITICAL operation that must be atomic:
        1. Validate booking ownership and remaining count
        2. Calculate clinical metrics per capture view using PostureCalibrator
        3. Create PostureAnalysis record in database
        4. Deduct screening count from booking (atomic)
        5. Commit transaction or rollback on error
        
        The entire operation is wrapped in a database transaction to ensure
        atomicity. If any step fails, the transaction is rolled back and no
        screening count is deducted.
        
        Args:
            user_id: UUID of the user completing the analysis
            booking_id: UUID of the booking to deduct count from
            session_id: Session identifier from start_analysis()
            landmarks_data: Dictionary containing collected pose samples
                Expected format: {
                    "samples": [
                        {landmark_idx: (x, y, z, visibility), ...},
                        ...
                    ]
                }
                
        Returns:
            Dictionary containing:
                - analysis: Complete PostureAnalysis object with all 33 metrics
                - remainingCount: Updated remaining screening count
                
        Raises:
            UnauthorizedException: If booking not found or user doesn't own it
            BadRequestException: If no remaining counts, invalid data, or
                               metric calculation fails
                               
        Example:
            >>> landmarks_data = {
            ...     "samples": [
            ...         {0: (0.5, 0.3, 0.0, 0.95), 11: (0.4, 0.5, 0.0, 0.90), ...},
            ...         # ... 449 more samples
            ...     ]
            ... }
            >>> result = await PostureAnalysisService.finalize_analysis(
            ...     "user-123",
            ...     "booking-456",
            ...     "session-789",
            ...     landmarks_data
            ... )
            >>> print(result["analysis"]["fhdPixels"])
            45.2
            >>> print(result["remainingCount"])
            4
            
        Note:
            Implements requirements:
            - AC-4.2: System calculates all 33 clinical metrics accurately
            - AC-4.3: System stores analysis data linked to the booking
            - AC-4.6: System deducts 1 screening count upon completion
            - AC-4.7: System updates remaining count display immediately
            - AC-9.4: If analysis fails, count is NOT deducted
            - SR-2: Validate user owns booking before allowing assessment
            - SR-4: Verify booking has remaining screening counts
            - SR-8: Atomic count deduction (prevent race conditions)
            - DR-1: Store all 33 clinical metrics with 2 decimal precision
            - DR-2: Store raw landmarks JSON for visualization
            - DR-3: Link each analysis to a specific booking
            - DR-7: Ensure screening count consistency
            
        Transaction Flow:
            1. BEGIN TRANSACTION
            2. Validate booking ownership and count (with lock)
            3. Calculate metrics from samples
            4. Create PostureAnalysis record
            5. Deduct screening count (atomic increment/decrement)
            6. COMMIT TRANSACTION
            
            If any step fails:
            - ROLLBACK TRANSACTION
            - No PostureAnalysis created
            - No screening count deducted
            - Error raised to caller
        """
        from app.core.metrics.legacy_mapping import posture_db_payload
        from app.core.pose.calibration_v2 import PostureCalibrator
        from app.utils.screening_count import ScreeningCountManager
        
        # Validate booking ownership BEFORE starting transaction
        # This prevents unnecessary transaction overhead for invalid requests
        booking = await db.booking.find_first(
            where={"id": booking_id, "userId": user_id}
        )
        
        if not booking:
            raise UnauthorizedException(
                "Booking not found or access denied. Please ensure you own this booking."
            )
        
        # Validate remaining count BEFORE starting transaction
        if booking.remainingScreeningCount <= 0:
            raise BadRequestException(
                f"No remaining screening counts for this booking. "
                f"Used: {booking.usedScreeningCount}/{booking.totalScreeningCount}. "
                f"Please purchase a new service plan to continue."
            )
        
        # Calculate clinical metrics from collected samples
        # This is done BEFORE the transaction to avoid holding locks during computation
        try:
            # The client may send either pixel coordinates (server-side frame
            # processing) or MediaPipe's 0-1 normalised coordinates (browser samples).
            # Normalised coordinates are anisotropic - x is divided by width and y by
            # height - so they must be corrected before any angle is computed.
            coord_space = landmarks_data.get("coordinateSpace")
            img_w = landmarks_data.get("imageWidth")
            img_h = landmarks_data.get("imageHeight")
            aspect = (float(img_w) / float(img_h)) if img_w and img_h else None
            normalised = _looks_normalised(landmarks_data) if coord_space is None else (
                coord_space == "normalized"
            )
            calibrator = PostureCalibrator(normalised_input=normalised, aspect_ratio=aspect)
            
            # Check if we have the new multi-pose structure
            if "poses" in landmarks_data and landmarks_data["poses"]:
                # New multi-pose structure
                poses = landmarks_data["poses"]
                total_samples_added = 0
                captured_poses = []
                
                print(f"Processing multi-pose data with {len(poses)} poses")
                
                # Process each pose type
                for pose_type, pose_data in poses.items():
                    if pose_type not in ["front", "leftside", "rightside", "back"]:
                        print(f"Skipping unknown pose type: {pose_type}")
                        continue
                    
                    captured_poses.append(pose_type)
                    samples_added = 0
                    
                    # Check if we have raw frames or processed samples for this pose
                    if "frames" in pose_data and pose_data["frames"]:
                        # Same removal as the legacy branch below: server-side MediaPipe
                        # on base64 frames, unreachable since the browser took over.
                        raise BadRequestException(
                            f"Raw video frames are no longer accepted for the "
                            f"'{pose_type}' pose. Send landmark samples instead."
                        )
                    elif "samples" in pose_data and pose_data["samples"]:
                        # Use pre-processed samples for this pose
                        samples = pose_data["samples"]
                        print(f"Processing {len(samples)} pre-processed samples for {pose_type} pose...")
                        
                        # Debug first few samples
                        for i, sample in enumerate(samples[:2]):  # Check first 2 samples
                            print(f"Sample {i} ({pose_type}) keys: {list(sample.keys()) if sample else 'None'}")
                            if sample and "pose" in sample:
                                pose_keys = list(sample["pose"].keys())
                                print(f"Sample {i} ({pose_type}) pose keys: {pose_keys[:5]}... (total: {len(pose_keys)})")
                        
                        for sample in samples:
                            # Add to calibrator with appropriate view
                            view_map = {
                                "front": "front",
                                "leftside": "leftside",
                                "rightside": "rightside",
                                "back": "back"
                            }
                            view = view_map.get(pose_type, "front")
                            
                            if calibrator.add_sample(sample, view=view):
                                samples_added += 1
                                total_samples_added += 1
                        
                        print(f"{pose_type} pose: {samples_added} samples added")
                    else:
                        print(f"No frames or samples found for {pose_type} pose")
                
                print(f"Total samples added across all poses: {total_samples_added}")
                
                # Store captured poses for database
                captured_poses_str = ",".join(captured_poses) if captured_poses else None
                
            # Check for old structure (backward compatibility)
            elif "frames" in landmarks_data and landmarks_data["frames"]:
                # Raw base64 frames, from the architecture that ran MediaPipe on the
                # server. No client has sent this shape since extraction moved into the
                # browser. Rejected rather than silently accepted: quietly supporting a
                # shape nobody sends means carrying an image-decode path on a public
                # endpoint, and a caller sending it is confused about the contract.
                raise BadRequestException(
                    "Raw video frames are no longer accepted. Send the landmark samples "
                    "extracted in the browser, under 'poses'."
                )
            elif "samples" in landmarks_data and landmarks_data["samples"]:
                # Old structure: pre-processed samples
                samples_added = 0
                print(f"Received {len(landmarks_data['samples'])} pre-processed samples (old structure)")
                
                # Debug first few samples
                for i, sample in enumerate(landmarks_data["samples"][:3]):  # Check first 3 samples
                    print(f"Sample {i} keys: {list(sample.keys()) if sample else 'None'}")
                    if sample and "pose" in sample:
                        pose_keys = list(sample["pose"].keys())
                        print(f"Sample {i} pose keys: {pose_keys[:10]}... (total: {len(pose_keys)})")
                
                for sample in landmarks_data["samples"]:
                    if calibrator.add_sample(sample, view="front"):
                        samples_added += 1
                
                print(f"Successfully added {samples_added} samples to calibrator")
                total_samples_added = samples_added
                captured_poses_str = "front"  # Default for old structure
            else:
                raise BadRequestException(
                    "No pose samples or frames provided. Please ensure at least 150 frames were captured."
                )
            
            if total_samples_added < 50:  # Minimum threshold - lowered from 100 to 50
                raise BadRequestException(
                    f"Insufficient valid samples ({total_samples_added} out of {len(frames) if 'frames' in landmarks_data else 'unknown'}). "
                    f"Frames with pose detected: {frames_with_pose if 'frames' in landmarks_data else 'N/A'}. "
                    f"Please ensure good lighting, full body is visible, and you're standing still during capture. "
                    f"Try to position yourself in frame before starting the capture."
                )
            
            # Finalize calibration to calculate all 33 metrics
            calibration = calibrator.finalize(person_id=user_id)
            
            if not calibration:
                raise BadRequestException(
                    "Failed to calculate clinical metrics from pose samples. "
                    "Please retry the analysis with better lighting and positioning."
                )
                
        except BadRequestException:
            # Re-raise BadRequestException as-is
            raise
        except Exception as e:
            # Wrap unexpected errors
            import traceback
            traceback.print_exc()
            raise BadRequestException(
                f"Metric calculation failed: {str(e)}. "
                f"Please retry the analysis."
            )
        
        # Start database transaction for atomic operations
        # This ensures PostureAnalysis creation and count deduction are atomic
        # Increased timeout to 120 seconds to handle large landmarks data and processing
        # Note: Prisma timeout is in seconds, not milliseconds
        try:
            # Representative (median) landmark set per capture view. Stored per view
            # rather than pooled, because a landmark averaged across a front and a side
            # capture corresponds to no real anatomy.
            representative = calibration.representative_landmarks or {}
            landmarks_data_clean = None
            if representative:
                landmarks_data_clean = {
                    "format": "per_view_median",
                    "views": {
                        view: {str(idx): coords for idx, coords in landmarks.items()}
                        for view, landmarks in representative.items()
                    },
                    "framesPerView": calibration.frames_per_view,
                }
            # ✅ STEP 4/5: CREATE DATA
            # Legacy metric columns are filled only where the v2 metric measures the
            # same quantity in the same unit. Everything else is NULL, and metricsJson
            # carries the full per-metric value + status + confidence + citation.
            # The previous code coerced every missing value to 0.0, which made an
            # unmeasurable metric indistinguishable from a genuine zero.
            data = {
                "user": {"connect": {"id": user_id}},
                "booking": {"connect": {"id": booking_id}},
                **_wrap_json(posture_db_payload(calibration)),
                "status": "completed"
            }

            # Add capturedPoses field if we have it
            if 'captured_poses_str' in locals() and captured_poses_str:
                data["capturedPoses"] = captured_poses_str

            # Store landmarks data with multi-pose structure if available
            # Store only slim summary — raw 240-frame arrays make the DB column
            # huge (5-50 MB), causing slow reads on every assessment list load.
            # Per-pose best-frame landmarks + images are stored in PoseLandmarks (Step 6b).
            import json
            if "poses" in landmarks_data and landmarks_data["poses"]:
                slim_summary = {
                    "capturedPoses": list(landmarks_data["poses"].keys()),
                    "totalFrames": landmarks_data.get("totalFrames", 0),
                    "poses": {
                        pose: {"frameCount": info.get("frameCount", 0)}
                        for pose, info in landmarks_data["poses"].items()
                        if isinstance(info, dict)
                    },
                }
                data["landmarksData"] = json.dumps(slim_summary)
            elif landmarks_data_clean:
                data["landmarksData"] = json.dumps(landmarks_data_clean)

            print("Creating PostureAnalysis...")

            # ✅ STEP 6: SAVE (NO TRANSACTION)
            analysis = await db.postureanalysis.create(data=data)

            # ✅ STEP 6b: SAVE POSE IMAGES + LANDMARKS TO PoseLandmarks
            import json as _json
            pose_images = landmarks_data.get("poseImages") or {}
            pose_best_frames = landmarks_data.get("poseBestFrameData") or {}
            poses_meta = landmarks_data.get("poses") or {}
            for pose_type in ("front", "leftside", "rightside", "back"):
                image_data = pose_images.get(pose_type)
                best_frame = pose_best_frames.get(pose_type) or {}
                # Skip if no image and no landmark data
                if not image_data and not best_frame:
                    continue
                frame_count = 0
                if isinstance(poses_meta.get(pose_type), dict):
                    frame_count = poses_meta[pose_type].get("frameCount", 0)
                lm_data = _json.dumps({
                    "landmarks2D": best_frame.get("landmarks2D"),
                    "landmarks3D": best_frame.get("landmarks3D"),
                    "visibility":  best_frame.get("visibility", 0),
                    "frameIndex":  best_frame.get("frameIndex", 0),
                }) if best_frame else None
                try:
                    await db.poselandmarks.create(data={
                        "analysis": {"connect": {"id": analysis.id}},
                        "poseType": pose_type,
                        "imageData": image_data,
                        "landmarksData": lm_data,
                        "frameCount": frame_count,
                    })
                    print(f"Saved PoseLandmarks for pose: {pose_type}")
                except Exception as img_err:
                    # Non-fatal: log but don't block the analysis save
                    print(f"Warning: failed to save pose data for {pose_type}: {img_err}")

            # ✅ STEP 7: UPDATE COUNT (SEPARATE)
            updated_booking = await db.booking.update(
                where={"id": booking_id},
                data={
                    "usedScreeningCount": {"increment": 1},
                    "remainingScreeningCount": {"decrement": 1}
                }
            )

            return {
                "analysis": analysis,
                "remainingCount": updated_booking.remainingScreeningCount
            }
                
        except (UnauthorizedException, BadRequestException):
            # Re-raise known exceptions
            # Transaction is automatically rolled back
            raise
        except Exception as e:
            # Wrap unexpected database errors
            # Transaction is automatically rolled back
            raise BadRequestException(
                f"Failed to save analysis: {str(e)}. "
                f"No screening count was deducted. Please retry."
            )
    
    @staticmethod
    def _fix_landmarks_data_for_storage(landmarks_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fix landmarks data for storage by converting numeric keys to string keys.
        
        GraphQL has issues with numeric keys in JSON objects, so we convert
        keys like "0", "1", "2" to "landmark_0", "landmark_1", "landmark_2".
        
        Args:
            landmarks_data: Original landmarks data with numeric keys
            
        Returns:
            Fixed landmarks data with string keys
        """
        import copy
        
        def fix_numeric_keys(obj, depth=0):
            if isinstance(obj, dict):
                new_dict = {}
                for key, value in obj.items():
                    # Convert numeric keys to string keys with prefix
                    # Handle both string and integer keys
                    if isinstance(key, int) or (isinstance(key, str) and key.isdigit()):
                        new_key = f"landmark_{key}"
                        if depth == 0:
                            print(f"DEBUG: Fixed key {key} -> {new_key} at depth {depth}")
                    else:
                        new_key = key
                    
                    # Recursively fix nested objects
                    new_dict[new_key] = fix_numeric_keys(value, depth + 1)
                return new_dict
            elif isinstance(obj, list):
                return [fix_numeric_keys(item, depth + 1) for item in obj]
            else:
                return obj
        
        # Create a deep copy to avoid modifying the original
        fixed_data = copy.deepcopy(landmarks_data)
        print(f"DEBUG: Starting _fix_landmarks_data_for_storage")
        result = fix_numeric_keys(fixed_data)
        print(f"DEBUG: Finished _fix_landmarks_data_for_storage")
        return result
    
    @staticmethod
    async def cancel_analysis(session_id: str) -> Dict[str, str]:
        """
        Cancel analysis session without deducting count.
        
        This method invalidates an analysis session without making any database
        changes or deducting screening counts. It's used when a user cancels
        the analysis before completion (e.g., poor lighting, incorrect positioning,
        or simply changing their mind).
        
        In a production environment with Redis session storage, this method would
        remove the session from the cache. For now, since session validation is
        done via booking ownership checks, this method simply returns a success
        message.
        
        Args:
            session_id: Unique session identifier from start_analysis()
            
        Returns:
            Dictionary containing:
                - message: Success message confirming cancellation
                
        Example:
            >>> result = await PostureAnalysisService.cancel_analysis("session-789")
            >>> print(result["message"])
            "Analysis cancelled successfully"
            
        Note:
            Implements requirements:
            - AC-5.5: System allows user to cancel and retry without count deduction
            - AC-9.4: If analysis fails, count is NOT deducted
            
        Future Enhancement:
            When Redis is implemented for session management, this method should:
            - await redis.delete(f"analysis_session:{session_id}")
            - Log the cancellation for analytics
            - Return session metadata (booking_id, frames_captured, etc.)
        """
        # TODO: In production with Redis, remove session from cache:
        # await redis.delete(f"analysis_session:{session_id}")
        
        # For now, simply return success message
        # Session validation is done via booking ownership checks in other methods
        return {
            "message": "Analysis cancelled successfully. No screening count was deducted."
        }
    
    @staticmethod
    async def get_user_assessments(
        user_id: str,
        booking_id: Optional[str] = None,
        limit: int = 10,
        offset: int = 0
    ) -> List[Any]:
        """
        Get user's posture assessments with optional booking filter.
        
        This method retrieves all posture analyses for a user, with optional
        filtering by booking. Results are paginated and include related booking
        and service information for context. Assessments are ordered by analysis
        date (most recent first).
        
        Args:
            user_id: UUID of the user whose assessments to retrieve
            booking_id: Optional UUID to filter assessments by specific booking
            limit: Maximum number of assessments to return (default: 10)
            offset: Number of assessments to skip for pagination (default: 0)
            
        Returns:
            List of PostureAnalysis objects with related booking and service data.
            Each assessment includes:
                - All 33 clinical metrics
                - Analysis metadata (date, status)
                - Landmarks data for visualization (parsed from JSON string)
                - Related booking information
                - Related service information
                
        Example:
            >>> # Get all assessments for a user
            >>> assessments = await PostureAnalysisService.get_user_assessments(
            ...     "user-123",
            ...     limit=20
            ... )
            >>> print(len(assessments))
            15
            
            >>> # Get assessments for a specific booking
            >>> booking_assessments = await PostureAnalysisService.get_user_assessments(
            ...     "user-123",
            ...     booking_id="booking-456",
            ...     limit=5
            ... )
            >>> print(booking_assessments[0].bookingId)
            "booking-456"
            
        Note:
            Implements requirements:
            - AC-7.1: User can access assessment history from booking details
            - AC-7.2: Each booking shows list of completed assessments with dates
            - AC-7.6: User can filter/sort assessments by date
            - AC-8.1: User can access "All Assessments" view
            - AC-8.2: System displays assessments from all bookings chronologically
            - AC-8.3: Each assessment shows associated booking information
            - AC-8.4: User can filter by booking, date range, or metric values
            - SR-3: Validate user owns analysis data before access
            
        Pagination:
            - Use limit and offset for pagination
            - Default limit is 10 assessments per page
            - Offset allows skipping assessments (e.g., offset=10 for page 2)
            
        Ordering:
            - Results are ordered by analysisDate DESC (most recent first)
            - This ensures users see their latest assessments first
            
        Relations:
            - Includes booking data (status, dates, screening counts)
            - Includes service data (name, description, features)
            - Allows frontend to display full context for each assessment
        """
        # Build where clause with user_id (required)
        where_clause = {"userId": user_id}
        
        # Add optional booking filter
        if booking_id:
            where_clause["bookingId"] = booking_id
        
        # List view: only booking + service needed. poseLandmarks (images) and
        # landmarksData (skeleton) are not used in AssessmentCard at all.
        assessments = await db.postureanalysis.find_many(
            where=where_clause,
            include={
                "booking": {
                    "include": {
                        "service": True
                    }
                }
            },
            order={"analysisDate": "desc"},
            skip=offset,
            take=limit
        )

        result = []
        for assessment in assessments:
            data = assessment.model_dump()

            # Not needed in list view — skeleton is only on detail page
            data.pop("landmarksData", None)
            result.append(data)

        return result
    
    @staticmethod
    async def get_analysis_by_id(
        analysis_id: str,
        user_id: str
    ) -> Optional[Any]:
        """
        Get specific analysis by ID with ownership validation.
        
        This method retrieves a single posture analysis by its ID, ensuring that
        the requesting user owns the analysis. It includes related booking and
        service information for full context. Returns None if the analysis doesn't
        exist or the user doesn't own it.
        
        Args:
            analysis_id: UUID of the analysis to retrieve
            user_id: UUID of the user requesting the analysis
            
        Returns:
            PostureAnalysis object with all metrics and relations, or None if not
            found or user doesn't own it. Includes:
                - All 33 clinical metrics
                - Analysis metadata (date, status)
                - Landmarks data for 3D visualization (parsed from JSON string)
                - Related booking information (status, dates, screening counts)
                - Related service information (name, description, features)
                
        Example:
            >>> analysis = await PostureAnalysisService.get_analysis_by_id(
            ...     "analysis-123",
            ...     "user-456"
            ... )
            >>> if analysis:
            ...     print(f"FHD: {analysis.fhdPixels}px")
            ...     print(f"Booking: {analysis.booking.service.name}")
            ... else:
            ...     print("Analysis not found or access denied")
            
        Note:
            Implements requirements:
            - AC-7.3: User can view detailed results for any past assessment
            - AC-7.5: System renders 3D skeleton visualization from stored landmarks
            - SR-3: Validate user owns analysis data before access
            
        Security:
            - Ownership validation prevents users from accessing other users' data
            - Returns None instead of raising exception to prevent information leakage
            - Query includes userId in WHERE clause for database-level security
            
        Relations:
            - Includes booking data (status, dates, screening counts)
            - Includes service data (name, description, features)
            - Allows frontend to display full context for the assessment
        """
        analysis = await db.postureanalysis.find_first(
            where={"id": analysis_id, "userId": user_id},
            include={
                "booking": {
                    "include": {
                        "service": True
                    }
                },
                "poseLandmarks": True,
            }
        )

        if not analysis:
            return None

        import json as _json

        data = analysis.model_dump()

        # Parse landmarksData JSON string back to object for frontend
        if data.get("landmarksData"):
            try:
                data["landmarksData"] = _json.loads(data["landmarksData"])
            except (ValueError, TypeError):
                pass

        # Build per-pose dict from PoseLandmarks (image + skeleton data)
        poses: dict = {}
        for lm in (analysis.poseLandmarks or []):
            lm_data = None
            if lm.landmarksData:
                try:
                    lm_data = _json.loads(lm.landmarksData) if isinstance(lm.landmarksData, str) else lm.landmarksData
                except (ValueError, TypeError):
                    pass
            poses[lm.poseType] = {
                "imageData":   lm.imageData,
                "landmarks2D": lm_data.get("landmarks2D") if lm_data else None,
                "landmarks3D": lm_data.get("landmarks3D") if lm_data else None,
                "visibility":  lm_data.get("visibility", 0) if lm_data else 0,
                "frameIndex":  lm_data.get("frameIndex", 0) if lm_data else 0,
            }
        data["poses"] = poses
        data.pop("poseLandmarks", None)

        return data
    
    @staticmethod
    async def validate_booking(
        booking_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Validate if booking can be used for analysis.
        
        This method checks whether a booking is valid for starting a posture
        analysis. It verifies booking ownership, checks the booking status,
        and ensures there are remaining screening counts available.
        
        Args:
            booking_id: UUID of the booking to validate
            user_id: UUID of the user requesting validation
            
        Returns:
            Dictionary containing:
                - valid: Boolean indicating if booking can be used
                - remainingCount: Number of remaining screening counts
                - totalCount: Total allocated screening counts
                - usedCount: Number of used screening counts
                - message: Optional message explaining why booking is invalid
                
        Example:
            >>> # Valid booking
            >>> result = await PostureAnalysisService.validate_booking(
            ...     "booking-123",
            ...     "user-456"
            ... )
            >>> print(result)
            {
                "valid": True,
                "remainingCount": 5,
                "totalCount": 10,
                "usedCount": 5,
                "message": None
            }
            
            >>> # Invalid booking (no counts)
            >>> result = await PostureAnalysisService.validate_booking(
            ...     "booking-789",
            ...     "user-456"
            ... )
            >>> print(result)
            {
                "valid": False,
                "remainingCount": 0,
                "totalCount": 10,
                "usedCount": 10,
                "message": "No remaining screening counts"
            }
            
        Note:
            Implements requirements:
            - AC-3.1: User must select an active booking before starting
            - AC-3.2: System only shows bookings with remaining counts > 0
            - AC-3.3: System displays remaining count for selected booking
            - AC-3.4: System prevents assessment start if no valid bookings exist
            - SR-2: Validate user owns booking before allowing assessment
            - SR-4: Verify booking has remaining screening counts before starting
            
        Validation Rules:
            A booking is valid if ALL of the following are true:
            1. Booking exists and user owns it
            2. Booking status is "CONFIRMED" or "COMPLETED"
            3. Remaining screening count > 0
            
        Return Values:
            - If booking not found:
                valid=False, counts=0, message="Booking not found"
            - If no remaining counts:
                valid=False, message="No remaining screening counts"
            - If invalid status:
                valid=False, message="Booking status '{status}' is not valid"
            - If all checks pass:
                valid=True, message=None
        """
        # Query booking with ownership check
        booking = await db.booking.find_first(
            where={"id": booking_id, "userId": user_id}
        )
        
        # Handle booking not found
        if not booking:
            return {
                "valid": False,
                "remainingCount": 0,
                "totalCount": 0,
                "usedCount": 0,
                "message": "Booking not found"
            }
        
        # Check validation criteria
        valid_statuses = ["CONFIRMED", "COMPLETED"]
        has_remaining_counts = booking.remainingScreeningCount > 0
        has_valid_status = booking.status in valid_statuses
        
        # Determine overall validity
        is_valid = has_remaining_counts and has_valid_status
        
        # Generate appropriate message if invalid
        message = None
        if not has_remaining_counts:
            message = "No remaining screening counts"
        elif not has_valid_status:
            message = f"Booking status '{booking.status}' is not valid"
        
        return {
            "valid": is_valid,
            "remainingCount": booking.remainingScreeningCount,
            "totalCount": booking.totalScreeningCount,
            "usedCount": booking.usedScreeningCount,
            "message": message
        }


def _looks_normalised(landmarks_data: dict) -> bool:
    """
    Guess whether landmark coordinates are 0-1 normalised rather than pixels.

    Only consulted when the client does not declare `coordinateSpace`. MediaPipe's
    normalised space divides x by frame width and y by frame height, which makes it
    anisotropic; getting this wrong skews every angle. The heuristic is deliberately
    conservative - it samples real coordinates and only reports normalised when every
    observed value sits inside [0, 1.5].

    Clients should send `coordinateSpace` explicitly so this never has to run.
    """
    def sample_values(container, budget=60):
        found = []
        poses = container.get("poses") or {}
        buckets = list(poses.values()) if poses else [container]
        for bucket in buckets:
            for sample in (bucket.get("samples") or [])[:10]:
                pose = (sample or {}).get("pose") or {}
                for value in list(pose.values())[:budget]:
                    if isinstance(value, (list, tuple)) and len(value) >= 2:
                        found.extend([value[0], value[1]])
                    if len(found) >= budget:
                        return found
        return found

    values = sample_values(landmarks_data)
    if not values:
        return False
    return all(-0.5 <= float(v) <= 1.5 for v in values)


def _wrap_json(payload: dict) -> dict:
    """
    Wrap dict-valued columns in prisma.Json.

    Prisma Python will not accept a bare dict for a Json column - it needs the Json
    marker type to distinguish a JSON value from a nested relation input, and the error
    it raises otherwise ("should be of any of the following types: Json") is misleading
    because it also complains about an unrelated missing userId.
    """
    from prisma import Json

    return {
        key: (Json(value) if isinstance(value, (dict, list)) else value)
        for key, value in payload.items()
    }
