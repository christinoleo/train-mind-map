# Use TypeScript and PixiJS instead of a game engine

The game targets mobile browsers. The budget is 5 MB or less transferred and interactive in 3 seconds or less on 4G. Godot 4 and Unity web exports weigh tens of megabytes and start slowly on phones, so we render with PixiJS 8 (WebGL, about 260 KB gzip) and write our own camera, input and audio. Diagram libraries such as React Flow, JointJS and GoJS were also rejected: they render with the DOM or SVG and cannot animate thousands of items.
