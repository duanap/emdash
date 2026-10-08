The video is a generated two-second blue frame with no audio. Generate it with FFmpeg:

```sh
ffmpeg -f lavfi -i color=c=blue:s=32x18:r=2:d=2 -c:v libvpx -b:v 16k -an playable-video.webm
```

A fixed clip keeps playback tests independent of canvas capture support in headless browsers.
