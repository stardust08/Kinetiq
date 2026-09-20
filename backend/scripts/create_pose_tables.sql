-- SQL script to create pose data tables for SQLAlchemy storage
-- These tables store pose data that doesn't work well with Prisma/GraphQL

-- Table: pose_analyses
-- Stores raw pose data including 450 frames with landmarks
CREATE TABLE IF NOT EXISTS pose_analyses (
    id SERIAL PRIMARY KEY,
    
    -- Link to Prisma PostureAnalysis table
    posture_analysis_id VARCHAR(255) NOT NULL UNIQUE REFERENCES "PostureAnalysis"(id) ON DELETE CASCADE,
    
    -- Raw frames data (450 frames with base64 images)
    -- Stored as JSONB for efficient querying
    raw_frames JSONB,
    
    -- Processed landmarks (array of frames, each frame is array of landmarks)
    -- Format: [[{x, y, z, visibility}, ...], ...]
    landmarks_data JSONB,
    
    -- Sample data used for calibration
    calibration_samples JSONB,
    
    -- Additional metadata
    frame_count INTEGER DEFAULT 0,
    average_visibility FLOAT DEFAULT 0.0,
    processing_time_ms INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    CONSTRAINT fk_posture_analysis FOREIGN KEY (posture_analysis_id) REFERENCES "PostureAnalysis"(id)
);

-- Indexes for pose_analyses table
CREATE INDEX IF NOT EXISTS idx_pose_analyses_posture_analysis_id ON pose_analyses(posture_analysis_id);
CREATE INDEX IF NOT EXISTS idx_pose_analyses_created_at ON pose_analyses(created_at);

-- Table: pose_metrics
-- Stores detailed pose metrics in a queryable format
CREATE TABLE IF NOT EXISTS pose_metrics (
    id SERIAL PRIMARY KEY,
    
    -- Link to Prisma PostureAnalysis table
    posture_analysis_id VARCHAR(255) NOT NULL UNIQUE REFERENCES "PostureAnalysis"(id) ON DELETE CASCADE,
    
    -- I. Global Posture (8 metrics)
    fhd_pixels FLOAT,
    cervical_angle FLOAT,
    head_lateral_flexion FLOAT,
    head_rotation FLOAT,
    thoracic_kyphosis_angle FLOAT,
    lumbar_lordosis_angle FLOAT,
    trunk_lateral_shift FLOAT,
    trunk_angle FLOAT,
    
    -- II. Shoulder & Arm (6 metrics)
    left_shoulder_angle FLOAT,
    right_shoulder_angle FLOAT,
    shoulder_height_diff FLOAT,
    rounded_shoulder_angle FLOAT,
    left_elbow_angle FLOAT,
    right_elbow_angle FLOAT,
    
    -- III. Pelvis & Hip (5 metrics)
    left_hip_angle FLOAT,
    right_hip_angle FLOAT,
    pelvic_obliquity FLOAT,
    pelvic_tilt_angle FLOAT,
    hip_height_diff FLOAT,
    
    -- IV. Lower Extremity (9 metrics)
    left_knee_angle FLOAT,
    right_knee_angle FLOAT,
    knee_varus_valgus FLOAT,
    knee_flexion_neutral FLOAT,
    q_angle_left FLOAT,
    q_angle_right FLOAT,
    foot_progression_angle FLOAT,
    pronation_supination_left FLOAT,
    pronation_supination_right FLOAT,
    
    -- V. Body Proportions (7 metrics)
    shoulder_width FLOAT,
    hip_width FLOAT,
    torso_length FLOAT,
    left_arm_length FLOAT,
    right_arm_length FLOAT,
    left_leg_length FLOAT,
    right_leg_length FLOAT,
    
    -- Additional calculated fields
    overall_posture_score FLOAT,
    symmetry_score FLOAT,
    risk_level VARCHAR(50),  -- low, medium, high
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    CONSTRAINT fk_pose_metrics_posture_analysis FOREIGN KEY (posture_analysis_id) REFERENCES "PostureAnalysis"(id)
);

-- Indexes for pose_metrics table
CREATE INDEX IF NOT EXISTS idx_pose_metrics_posture_analysis_id ON pose_metrics(posture_analysis_id);
CREATE INDEX IF NOT EXISTS idx_pose_metrics_created_at ON pose_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_pose_metrics_risk_level ON pose_metrics(risk_level);
CREATE INDEX IF NOT EXISTS idx_pose_metrics_overall_score ON pose_metrics(overall_posture_score);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for pose_analyses table
DROP TRIGGER IF EXISTS update_pose_analyses_updated_at ON pose_analyses;
CREATE TRIGGER update_pose_analyses_updated_at
    BEFORE UPDATE ON pose_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust based on your database user)
GRANT ALL PRIVILEGES ON TABLE pose_analyses TO neura_app;
GRANT ALL PRIVILEGES ON TABLE pose_metrics TO neura_app;
GRANT USAGE, SELECT ON SEQUENCE pose_analyses_id_seq TO neura_app;
GRANT USAGE, SELECT ON SEQUENCE pose_metrics_id_seq TO neura_app;

-- Comments for documentation
COMMENT ON TABLE pose_analyses IS 'Stores raw pose data including 450 frames with landmarks. Used to bypass Prisma/GraphQL field name restrictions.';
COMMENT ON TABLE pose_metrics IS 'Stores detailed pose metrics in a queryable format. Denormalized from PostureAnalysis table for better performance.';