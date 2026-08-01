---
title: LEDEX Photometric Estimator
subtitle: A browser-based lighting layout tool that turns catalog IES files and room geometry into a practical first-pass photometric study.
period: "2025–2026"
role: Technical Project Manager, Software & Automation
organization: LEDEX
industry: Industrial lighting · Hazardous locations
featured: true
order: 1
technologies:
  - Next.js
  - TypeScript
  - React
  - Web Workers
  - IES photometry
  - Structured product data
highlights:
  - Parses catalog IES files and evaluates room geometry in the browser.
  - Supports fixture comparison, 2D and 3D layouts, heatmaps, and quote handoff.
links:
  - label: Open the estimator
    url: https://ledex.ca/en/lighting-layout
logo:
  url: "/src/images/projects/ledex.svg"
  alt: "LEDEX mark"
image:
  url: "/src/images/projects/ledexOg.png"
  alt: "LEDEX photometric estimator interface"
---

## Context

LEDEX sells lighting for hazardous and demanding industrial environments. Customers often need a rough lighting layout before they can choose a fixture or request a sealed photometric study. That first step used to require an engineer to prepare every comparison.

I led the software work for a self-serve estimator inside the LEDEX product platform. It gives customers and sales teams a visual starting point while keeping a clear boundary between an estimate and an engineering document used for permits or tenders.

## My responsibility

I translated the lighting workflow into product requirements, data contracts, calculation rules, and a customer-facing interface. I also connected the tool to the product catalog and quote process, so users can move from a room layout to a real fixture configuration without re-entering the same information.

## Engineering work

### Photometric data pipeline

The estimator loads catalog IES files, parses their photometric distributions, and maps each record to a valid fixture configuration. Validation catches missing or incompatible data before a calculation reaches the interface.

### Calculation engine

The browser evaluates room dimensions, work-plane height, reflectance, fixture spacing, mounting height, and target illuminance. A Web Worker keeps recalculation off the main thread. Users can compare layouts without freezing the controls or 3D view.

### Layout and handoff

The interface combines a 2D plan, 3D scene, heatmap, isolines, summary results, and fixture controls. Users can save a project, print a layout, or send the selected configuration to LEDEX for pricing and engineering review.

## Result

The production tool gives customers an immediate way to test a layout idea and compare real LEDEX fixtures. It also gives the technical team structured project inputs when a customer requests a quote or sealed study.

The estimator states its limits in the interface. Electrical-code submissions and permit work still go through qualified engineering review.
