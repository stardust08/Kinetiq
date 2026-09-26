import { useMemo, useState } from 'react';
import type { Exercise } from '../../types/consultation';

export interface ExerciseVideoPlayerProps {
  exercise: Exercise;
  /** Renders a compact player, for use inside a list rather than on its own page. */
  compact?: boolean;
}

/**
 * Plays an exercise's demonstration video, or says plainly that there isn't one.
 *
 * The catalogue ships without video URLs. Exercise definitions live in code with their
 * citations, and a video URL cannot: inventing a plausible-looking link would put a
 * video nobody has watched in front of a patient about to copy it. A deployment attaches
 * its own through the admin screen.
 *
 * So the empty state matters as much as the player. It shows the written instructions -
 * which are always present - rather than a broken frame, because a patient with
 * instructions and no video can still do the exercise correctly.
 */
export function ExerciseVideoPlayer({ exercise, compact = false }: ExerciseVideoPlayerProps) {
  const [failed, setFailed] = useState(false);

  const embed = useMemo(() => {
    const url = exercise.videoUrl;
    if (!url) return null;

    // YouTube and Vimeo need an iframe against their embed host; a <video> tag pointed
    // at a watch URL renders nothing and reports no error.
    const youtube = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
    );
    if (youtube) {
      return { kind: 'iframe' as const, src: `https://www.youtube.com/embed/${youtube[1]}` };
    }
    const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) {
      return { kind: 'iframe' as const, src: `https://player.vimeo.com/video/${vimeo[1]}` };
    }
    return { kind: 'video' as const, src: url };
  }, [exercise.videoUrl]);

  const frameStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 10,
    background: '#0f172a',
    border: '1px solid #e2e8f0',
    display: 'block',
  };

  if (!embed || failed) {
    return (
      <div
        style={{
          ...frameStyle,
          background: '#f8fafc',
          display: 'grid',
          placeItems: 'center',
          padding: 16,
          textAlign: 'center',
        }}
      >
        <div>
          <p style={{ color: '#475569', fontSize: 13, margin: 0, fontWeight: 600 }}>
            {failed ? 'The video could not be played' : 'No video for this exercise yet'}
          </p>
          <p style={{ color: '#64748b', fontSize: 12, margin: '6px 0 0', maxWidth: 380 }}>
            {compact
              ? 'Follow the written steps below.'
              : 'The written steps below describe the movement in full. Your clinician can talk you through it in your next consultation.'}
          </p>
        </div>
      </div>
    );
  }

  if (embed.kind === 'iframe') {
    return (
      <iframe
        src={embed.src}
        title={`${exercise.name} demonstration`}
        style={frameStyle}
        // `fullscreen` so a patient can see foot position properly on a phone.
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
      />
    );
  }

  return (
    <video
      src={embed.src}
      poster={exercise.thumbnailUrl ?? undefined}
      controls
      playsInline
      // No autoplay: a plan with six exercises would otherwise start six videos at once.
      preload="metadata"
      onError={() => setFailed(true)}
      style={frameStyle}
    />
  );
}

export default ExerciseVideoPlayer;
