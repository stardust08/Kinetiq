"""
Seed the exercise catalogue from the code library.

Run once after migrating, and again after any change to
app/core/exercise/library.py:

    python scripts/seed_exercises.py

Safe to re-run. It upserts by slug rather than truncating, because an exercise row
carries a video somebody uploaded and plan items that point at it - rebuilding the table
would destroy both. Exercises that have left the library are deactivated rather than
deleted, since a patient may have one on an active plan right now.

Optionally attaches videos in bulk from a JSON file mapping slug to URL:

    python scripts/seed_exercises.py --videos data/exercise_videos.json

    {
      "chin-tuck": "https://www.youtube.com/watch?v=...",
      "glute-bridge": "/static/exercise-videos/glute-bridge.mp4"
    }

The library deliberately ships without video URLs - a real one cannot live in a source
file, and inventing a plausible-looking link would put a video nobody has watched in
front of a patient about to copy it.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api.exercise.service import ExerciseCatalogueService  # noqa: E402
from app.core.exercise.library import EXERCISES, validate_rules  # noqa: E402
from app.db.client import connect_db, db, disconnect_db  # noqa: E402


def _provider_for(url: str) -> str:
    if "youtu" in url:
        return "youtube"
    if "vimeo" in url:
        return "vimeo"
    if url.endswith(".m3u8"):
        return "hls"
    return "mp4"


async def main(video_map_path: str | None) -> int:
    # A broken rule means the engine silently prescribes nothing for a metric somebody
    # believes is covered. Fail before writing anything rather than seeding a catalogue
    # the rules cannot reach.
    problems = validate_rules()
    if problems:
        print("Refusing to seed: the exercise rules are incoherent.")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    await connect_db()
    try:
        result = await ExerciseCatalogueService.sync_from_library()
        print(
            f"Catalogue synced from {len(EXERCISES)} definitions: "
            f"{result['created']} created, {result['updated']} updated, "
            f"{result['retired']} retired."
        )

        if video_map_path:
            path = Path(video_map_path)
            if not path.exists():
                print(f"No video map at {path}; skipping video attachment.")
            else:
                mapping = json.loads(path.read_text())
                attached = missing = 0
                for slug, url in mapping.items():
                    exercise = await db.exercise.find_unique(where={"slug": slug})
                    if exercise is None:
                        print(f"  ! unknown slug in video map: {slug}")
                        missing += 1
                        continue
                    await db.exercise.update(
                        where={"id": exercise.id},
                        data={"videoUrl": url, "videoProvider": _provider_for(url)},
                    )
                    attached += 1
                print(f"Videos attached: {attached}. Unknown slugs: {missing}.")

        without_video = await db.exercise.count(
            where={"isActive": True, "videoUrl": None}
        )
        if without_video:
            print(
                f"\n{without_video} active exercise(s) have no video. Patients see the "
                f"written instructions instead, which is a usable but poorer experience. "
                f"Attach videos from Admin → Exercise library, or pass --videos."
            )
        return 0
    finally:
        await disconnect_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--videos",
        help="JSON file mapping exercise slug to video URL.",
        default=None,
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.videos)))
