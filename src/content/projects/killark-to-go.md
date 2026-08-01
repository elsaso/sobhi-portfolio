---
title: Killark To Go
subtitle: An iOS and Android catalog that helps field teams find, cross-reference, configure, and request hazardous-location electrical products.
period: "2024"
role: Lead Software Engineer
organization: Polaire Labs for Killark / Hubbell Canada
industry: Industrial electrical products
featured: true
order: 2
technologies:
  - React Native
  - TypeScript
  - FastAPI
  - PostgreSQL
  - Strapi
  - REST APIs
highlights:
  - Shipped one React Native codebase to iOS and Android.
  - Combined competitor cross-reference, configuration, cart, and catalog tools.
links:
  - label: View on Hubbell
    url: https://www.hubbell.com/hubbellcanada/en/killark-to-go
  - label: View on the App Store
    url: https://apps.apple.com/ca/app/killark-to-go/id6477622050
logo:
  url: "/src/images/projects/killark.svg"
  alt: "Killark To Go lightning mark"
image:
  url: "/src/images/projects/killarkOg.png"
  alt: "Killark To Go App Store screens"
---

## Context

Killark supplies electrical products for harsh and hazardous locations. Its Canadian sales teams and distributors needed a mobile catalog they could use away from a desk. The app had to handle part numbers, competitor equivalents, product families, configuration choices, and request lists.

I led the application build at Polaire Labs from data model through store release.

## My responsibility

I designed the mobile architecture, backend APIs, catalog model, content workflow, and release pipeline. I worked with the client to turn catalog rules into screens that field users could understand without losing the detail needed for an orderable product.

## Engineering work

### Cross-platform mobile application

React Native and TypeScript provided one codebase for iOS and Android. The interface supports category browsing, part-number search, competitor cross-reference, product details, and a step-by-step product builder.

### Product and content APIs

FastAPI and PostgreSQL serve catalog records, search data, cross-reference mappings, and configuration options. Strapi gives the product team a controlled way to update descriptions, categories, media, and catalog content without waiting for a new app release.

### Field workflow

Users can collect configured products, adjust quantities, and email a request list. The app keeps product discovery and the next sales step in one workflow.

## Result

Killark and Hubbell Canada promote the app as the mobile companion for their Canadian ready-to-ship program. The public App Store listing shows the catalog, smart search, custom product builder, cart, and send-list workflow in production.
