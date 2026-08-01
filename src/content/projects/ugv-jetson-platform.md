---
title: UGV Jetson Platform
subtitle: A ROS 2 rover controlled through a VR headset, with WebRTC video, LiDAR ranging, object detection, and measured edge-versus-relay performance.
period: "2025–2026"
role: Software Engineer · Team capstone
organization: ÉTS LOG795
industry: Robotics · Remote operations
featured: true
order: 3
technologies:
  - Python
  - ROS 2
  - WebRTC
  - Jetson Orin Nano
  - YOLOv8
  - LiDAR
  - FastAPI
highlights:
  - Built core WebRTC, relay, base-control, LiDAR, sensor-fusion, and benchmark paths.
  - Measured about 19 FPS for YOLOv8n inference on the Jetson test configuration.
links: []
logo:
  url: "/src/images/projects/ugv.svg"
  alt: "UGV rover mark"
image:
  url: "/src/images/projects/ugvOg.svg"
  alt: "UGV architecture connecting a rover, edge computer, and VR operator"
---

## Context

For our ÉTS capstone, Gaël Caron-Collette, Émeric Loriot, and I built a teleoperation system for a Jetson Orin Nano rover. An operator wears a Meta Quest 2, receives the rover’s camera feed, and sends movement and head-tracking commands through the headset controllers.

The prototype explored remote inspection and search scenarios where sending a person first would create unnecessary risk.

## My contribution

I worked across the rover and network stack. My commits cover the ROS 2 base and UART bridge, WebRTC and signaling, relay-server architecture, LiDAR integration, object-distance overlays, CUDA runtime fixes, error handling, KPI collection, and the benchmark tooling used in the technical report.

## Engineering work

### Rover control and sensing

ROS 2 nodes translate `/cmd_vel` messages into ESP32 motor commands, publish odometry, read the LD06 LiDAR, and expose camera and safety data. The modular packages let the team test hardware paths separately before running the full system.

### WebRTC teleoperation

The Jetson streams H.264 video to the headset and receives controls over a WebRTC DataChannel. A small FastAPI WebSocket service handles signaling. During local tests, peer connections established in under three seconds.

### Perception and performance

YOLOv8 runs on the Jetson GPU and adds object detections to the operator view. LiDAR supplies distance data for the overlay and minimap. Benchmark runs measured the video path, control delay, bandwidth, CPU, GPU, memory, and power use across on-rover and external-relay designs.

The Jetson configuration measured about 52.4 ms per YOLOv8n inference, close to 19 inference frames per second. The comparison showed where an external GPU improves vision latency and where the extra network dependency becomes a liability.

## Result

The team demonstrated VR driving, head-controlled camera movement, live object annotations, LiDAR distance data, and reproducible performance tests on real hardware.

The repository and full French technical report remain private because they contain team material and student identifiers. I can share the relevant code and report sections during an interview.
