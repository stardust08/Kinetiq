import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardShell, { card } from '../../components/dashboard/DashboardShell';
import { getStats, uploadExerciseVideo } from '../../api/admin';
import { getCatalogue, syncCatalogue, updateExercise } from '../../api/exercises';
import ExerciseVideoPlayer from '../../components/exercise/ExerciseVideoPlayer';
import type { Exercise } from '../../types/consultation';
import { adminNav } from './navigation';

/**
 * The exercise library.
 *
 * The clinical content - instructions, cautions, citations - comes from code and is not
 * editable here, deliberately: an exercise whose instructions can be changed by an HTTP
 * call is an exercise whose instructions nobody reviewed.
 *
 * What IS editable is the video, and that is the point of this page. The library ships
 * without video URLs because a real one cannot be put in a source file, so a deployment
 * attaches its own here.
 */
export default function AdminExercisesPage() {
  const queryClient = useQueryClient();
  const [region, setRegion] = useState('');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: exercises, isLoading } = useQuery({
    queryKey: ['admin', 'exercise-catalogue', region, search],
    queryFn: () =>
      getCatalogue({
        bodyRegion: region || undefined,
        search: search || undefined,
        includeInactive: true,
        limit: 200,
      }),
  });
  const { data: stats } = useQuery({ queryKey: ['admin', 'stats'], queryFn: getStats });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'exercise-catalogue'] });

  const sync = useMutation({
    mutationFn: syncCatalogue,
    onSuccess: (result) => {
      setFeedback(
        `Catalogue synced: ${result.created} added, ${result.updated} updated, ${result.retired} retired. Uploaded videos were preserved.`,
      );
      invalidate();
    },
  });

  const withoutVideo = (exercises ?? []).filter((exercise) => !exercise.videoUrl).length;

  return (
    <DashboardShell
      title="Exercise library"
      subtitle={
        exercises
          ? `${exercises.length} exercises · ${withoutVideo} without a video`
          : undefined
      }
      nav={adminNav(stats?.bookings.unassigned ?? 0)}
      actions={
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          style={{
            background: '#0e7490',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            padding: '9px 16px',
          }}
        >
          {sync.isPending ? 'Syncing…' : 'Sync from library'}
        </button>
      }
    >
      {feedback && (
        <p
          style={{
            background: '#ecfdf5',
            border: '1px solid #6ee7b7',
            borderRadius: 8,
            color: '#065f46',
            fontSize: 13,
            margin: 0,
            padding: '9px 12px',
          }}
        >
          {feedback}
        </p>
      )}

      {exercises?.length === 0 && !isLoading && (
        <p
          style={{
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            color: '#78350f',
            fontSize: 13,
            margin: 0,
            padding: '10px 12px',
          }}
        >
          The catalogue is empty. Press <strong>Sync from library</strong> to seed it from
          the code definitions - recommendations cannot attach exercises to a plan until
          you do.
        </p>
      )}

      <section style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search exercises"
          style={{ border: '1px solid #cbd5e1', borderRadius: 8, flex: 1, fontSize: 13, minWidth: 200, padding: '8px 10px' }}
        />
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          style={{ border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, padding: '8px 10px' }}
        >
          <option value="">All regions</option>
          {['CERVICAL','SHOULDER','ELBOW','THORACIC','LUMBAR','PELVIS','HIP','KNEE','ANKLE','FOOT','FULL_BODY'].map(
            (option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ),
          )}
        </select>
      </section>

      {isLoading ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {(exercises ?? []).map((exercise) => (
            <ExerciseAdminCard
              key={exercise.slug}
              exercise={exercise}
              onChanged={invalidate}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

/** One catalogue entry, with a video upload and a retire toggle. */
function ExerciseAdminCard({
  exercise,
  onChanged,
}: {
  exercise: Exercise;
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [urlDraft, setUrlDraft] = useState(exercise.videoUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadExerciseVideo(exercise.id as string, file, setProgress),
    onSuccess: () => {
      setProgress(null);
      setError(null);
      onChanged();
    },
    onError: (err) => {
      setProgress(null);
      setError(err instanceof Error ? err.message : 'Upload failed.');
    },
  });

  const saveUrl = useMutation({
    mutationFn: () =>
      updateExercise(exercise.id as string, {
        videoUrl: urlDraft,
        videoProvider: urlDraft.includes('youtu')
          ? 'youtube'
          : urlDraft.includes('vimeo')
            ? 'vimeo'
            : 'mp4',
      }),
    onSuccess: onChanged,
  });

  const toggleActive = useMutation({
    mutationFn: () =>
      updateExercise(exercise.id as string, { isActive: !exercise.isActive }),
    onSuccess: onChanged,
  });

  return (
    <article
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        display: 'grid',
        gap: 10,
        opacity: exercise.isActive === false ? 0.6 : 1,
        padding: 14,
      }}
    >
      <div>
        <strong style={{ fontSize: 14 }}>{exercise.name}</strong>
        <p style={{ color: '#64748b', fontSize: 12, margin: '3px 0 0' }}>
          {exercise.bodyRegion.replace('_', ' ')} · {exercise.difficulty}
          {exercise.isActive === false ? ' · retired' : ''}
        </p>
      </div>

      <ExerciseVideoPlayer exercise={exercise} compact />

      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
        }}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          style={{
            background: '#0e7490',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 12px',
          }}
        >
          {progress !== null ? `Uploading ${progress}%` : 'Upload video'}
        </button>
        <button
          type="button"
          onClick={() => toggleActive.mutate()}
          style={{
            background: 'transparent',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            color: '#334155',
            cursor: 'pointer',
            fontSize: 12,
            padding: '7px 12px',
          }}
        >
          {exercise.isActive === false ? 'Restore' : 'Retire'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
          placeholder="…or paste a YouTube / Vimeo / MP4 URL"
          style={{ border: '1px solid #cbd5e1', borderRadius: 6, flex: 1, fontSize: 12, minWidth: 0, padding: '6px 8px' }}
        />
        <button
          type="button"
          onClick={() => saveUrl.mutate()}
          disabled={!urlDraft || urlDraft === exercise.videoUrl || saveUrl.isPending}
          style={{
            background: urlDraft && urlDraft !== exercise.videoUrl ? '#334155' : '#cbd5e1',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            cursor: urlDraft && urlDraft !== exercise.videoUrl ? 'pointer' : 'not-allowed',
            fontSize: 12,
            padding: '6px 10px',
          }}
        >
          Save
        </button>
      </div>

      {error && <span style={{ color: '#b91c1c', fontSize: 12 }}>{error}</span>}
    </article>
  );
}
