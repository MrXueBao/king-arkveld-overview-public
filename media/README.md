# 动作演示素材

每个动作可以配置一个 MP4 和一张封面图。这里仅存放经过检查、计划公开的自行录制游戏实录。

## 建议规格

- 编码：H.264 MP4，不带音轨。
- 时长：先尝试 3–5 秒；较长连段以展示完整动作过程为准。
- 画面：480p 或 720p，约 24 fps。
- 裁切：突出怪物动作，保留足够环境以便辨认招式。
- 体积：短片先以每段约 0.5–1.5 MB 为目标，清晰度优先。
- 封面：小尺寸 WebP 或 JPEG，与视频分开加载。

## 命名与接入

文件名使用公共动作编号（例如 move-1），例如：

```text
media/videos/move-1.mp4
media/posters/move-1.webp
```

在 `data/actions.json` 中，为相应动作设置相对路径：

```json
"video": "./media/videos/move-1.mp4",
"poster": "./media/posters/move-1.webp"
```

页面仅在点击播放后加载 MP4。公开 Pages 中的媒体仍可直接下载，点击加载用于节省流量。
