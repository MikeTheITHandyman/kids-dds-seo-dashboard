# Kids DDS SEO & LLM Dashboard Specification

## 1. Project Overview
The Kids DDS Dashboard is an internal analytics platform designed to monitor traditional SEO performance (Google Analytics, Google Search Console) alongside AI Recommendation Visibility (ChatGPT, Claude, Gemini) for a pediatric dentistry practice in Lake County, IL.

## 2. Tech Stack
- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charting**: Recharts
- **Authentication**: NextAuth.js (Google Provider)
- **Database**: Firebase Admin SDK (Firestore)
- **APIs**: `@google-analytics/data`, `googleapis` (Search Console), OpenAI, Anthropic, Gemini APIs.

## 3. Architecture & Data Flow
The application operates entirely server-side for data fetching to protect API keys, passing serialized data down to Client Components (like charts and filters) for interactivity.

### 3.1 Authentication (NextAuth + Firestore)
- Uses `next-auth` with Google OAuth.
- Uses `@auth/firebase-adapter` to persist user sessions in a Firestore database (`kidsddsseodashboard` project).
- Pages are protected; unauthenticated users are redirected to `/api/auth/signin`.

### 3.2 Data Sources
1. **Google Analytics 4 (GA4)**: Fetches raw traffic volume, engagement rates, and visitor location (City) using a Google Cloud Service Account.
2. **Google Search Console (GSC)**: Fetches organic keyword rankings, impressions, clicks, and average SERP positions via the Service Account.
3. **Firestore Database**: Stores daily snapshots of LLM visibility scores.

## 4. Cron Job (`/api/cron/llm-tracker/route.ts`)
A nightly automated job that tests how often AI models recommend the practice.
- **Trigger**: Protected by a `CRON_SECRET` Bearer token.
- **Logic**: 
  - Randomly selects 2 communities from a list of Lake County locations (e.g., Grayslake, Libertyville).
  - Queries ChatGPT (gpt-4o), Claude (3.5 Sonnet), and Gemini (1.5 Flash) with 5 specific pediatric dentistry prompts (e.g., *"Who is the best pediatric dentist in {location}?"*).
  - Grades the responses checking for brand mentions ("kids dds", "kids dentist").
  - Calculates a percentage score (0-100%) for each AI and saves the day's record to the `llm_visibility` Firestore collection.

## 5. Core UI Components

### 5.1 Global Layout
- **Sidebar (`Sidebar.tsx`)**: Left-hand navigation linking to the 4 main dashboard views.
- **TopNav (`TopNav.tsx`)**: Top bar displaying the authenticated user's profile and logout button.

### 5.2 Reusable Components
- **`StatCard.tsx`**: A standard metric card (Title, Value, % Change).
- **`VisibilityChart.tsx`**: A generic Recharts `<LineChart>` wrapper that accepts arrays of data and line configurations. Handles both standard and reversed Y-axes (for Google Rankings where 1 is best).
- **`DateFilter.tsx`**: A dropdown (`1D`, `30D`, `YTD`, `custom`, etc.) that modifies URL `searchParams`. All pages are wrapped in `<Suspense>` and re-fetch server data dynamically when params change.
- **`ExportControls.tsx`**: Buttons to export the current view's data.

## 6. Dashboard Views (Pages)

### 6.1 Overview (`/dashboard/page.tsx`)
- **Purpose**: A unified view of traditional SEO and AI visibility.
- **Metrics**: Avg Google Search Position, ChatGPT Score, Claude Score.
- **Chart**: A single multi-line chart comparing Google SERP position against ChatGPT, Claude, and Gemini recommendation percentages over time.
- **Data Merging**: Fetches GSC data and Firestore LLM data concurrently, merging them by standard `YYYY-MM-DD` keys.

### 6.2 Search Engines (`/dashboard/search-visibility/page.tsx`)
- **Purpose**: Deep dive into traditional Google Search performance.
- **Metrics**: Total Clicks, Total Impressions, Avg CTR, Avg Position.
- **Chart**: Plots Clicks, Impressions, and Avg Position over time.
- **Table**: "Top Search Words" displaying real user queries and their exact CTRs and Impressions.

### 6.3 LLM Visibility (`/dashboard/llm-visibility/page.tsx`)
- **Purpose**: Deep dive into AI recommendation engine performance.
- **Metrics**: Aggregated recommendation scores for ChatGPT, Claude, and Gemini.
- **Chart**: Plots AI recommendation percentages (0-100%) over time.
- **Data Flow**: Reads directly from the `llm_visibility` Firestore collection.

### 6.4 Web Analytics (`/dashboard/analytics/page.tsx`)
- **Purpose**: Standard website traffic analysis (GA4).
- **Metrics**: Unique Users, Total Sessions, Pageviews, Avg. Engagement Rate.
- **Chart**: Plots Traffic (Users/Sessions/Pageviews) over time. If the `1D` date filter is selected, dynamically switches the GA4 dimension to `dateHour` to display a 24-hour intra-day trend.
- **Table**: "Top Local Cities" showing visitor locations dynamically pulled from the GA4 `city` dimension.
