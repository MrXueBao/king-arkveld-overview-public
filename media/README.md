# Public media

The player supports one optional MP4 and poster image per action code. Add only reviewed, self-recorded gameplay captures that you intend to make public.

Recommended starting profile:

- H.264 MP4, no audio track;
- 3–5 seconds, 480p or 720p, around 24 fps;
- crop to the monster/action while retaining enough context to recognize the move;
- target roughly 0.5–1.5 MB per clip; test visual clarity before reducing further;
- a small WebP/JPEG poster for the card, loaded separately from the video.

File names should use the public action code, for example:

```text
media/videos/cRampageBarrage.mp4
media/posters/cRampageBarrage.webp
```

Then set that action's `video` value in `data/actions.json` to the relative video path and `poster` to the relative poster path. The page does not fetch the MP4 until the visitor presses Play. Every file in a public Pages site can still be downloaded directly; this is bandwidth-conscious loading, not access control.
