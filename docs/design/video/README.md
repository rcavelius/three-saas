# Homepage explainer loops

One short silent loop per site, shown next to the hero so a visitor sees what the product does in a few seconds.
The text is real HTML next to the video (AI video text comes out garbled), so the clips contain no words.

| Site | Story | Caption | Model |
|---|---|---|---|
| GridRinse | messy sheet on a laptop → bubble squeegee → clean sheet | Messy CSV in → clean file out | FLUX 3 Video |
| ChangeKite | kite scans a site → red pins on broken spots → score card | Scan → score → fixes | Seedance 2.5 |
| WebhookTrail | sender fires a packet → robot catches, screen shows it → replays it back | Catch → inspect → replay | Seedance 2.5 |

How they were made (2026-11-23):

1. A 16:9 keyframe per site with Higgsfield `gpt_image_2_6` (quality high), using the site's own mascot art as the reference.
2. Image-to-video with the same keyframe as start and end frame, so each clip comes back to where it started.
   Seedance 2.5 (omni reference), MiniMax H3 Max and FLUX 3 Video: 2-4 takes per site, reviewed frame by frame
   (contact sheets in `<app>/takes/`). Rejected takes and the reasons are in each `manifest.json`.
3. ffmpeg (BelowNormal priority, one job at a time): a 0.6 s end-to-start dissolve for a seamless loop, 960 px wide,
   H.264 MP4 (faststart) + VP9 WebM, no audio, WebP poster. Every file is under 400 KB.

Each page plays them with `autoplay muted loop playsinline preload="none"` and shows only the poster under
`prefers-reduced-motion: reduce`.

Higgsfield spend: 7 GPT Image 2.6 (8.75) + 6 Seedance 2.5 (294) + 3 MiniMax H3 Max (45) + 1 FLUX 3 Video (42) = 389.75 credits.
