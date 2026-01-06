# Minimalist Exercise Tracker

A private, stateless, and local-first web application for logging workouts and visualizing physical activity through heatmaps.

### 🔗 [Launch Application](https://anon-anon-111.github.io/exercise-tracker/)

---

## Overview

This tracker is designed for users who prioritize data ownership and privacy. It operates on a **stateless architecture**, meaning no data is ever transmitted to a server or stored in a cloud database. All processing occurs locally within your browser's memory.

### Key Features
* **Multi-Year Heatmaps:** Automatic generation of activity grids for every year present in your data.
* **Session Statistics:** View total durations and session counts categorized by exercise type.
* **Print-Ready Reports:** Optimized CSS for exporting clean, high-resolution PDF summaries without UI clutter.
* **Mobile Optimized:** Designed with a "Courier" aesthetic for high readability on small screens.

---

## Workflow



Because this app is accountless, it follows a simple **Import-Update-Export** cycle:

1.  **Launch:** Open the web app on your phone or laptop.
2.  **Import:** Click the "Import CSV" zone to load your existing `exercises.csv`.
3.  **Log:** Add your new exercise entries for the day.
4.  **Export:** Click **"Export CSV"** to save the updated file to your device.
5.  **Reset:** Refreshing the page clears the session memory, ensuring your data remains private.

---

## 📱 Mobile Installation (PWA)

To use the tracker as a native-feeling app on your mobile device:

### iOS (Safari)
1. Navigate to the app URL.
2. Tap the **Share** icon (square with an up arrow).
3. Scroll down and select **"Add to Home Screen"**.

### Android (Chrome)
1. Navigate to the app URL.
2. Tap the **Three Dots** menu icon.
3. Select **"Install App"** or **"Add to Home Screen"**.

---

## 🔒 Privacy & Data Policy

* **No Tracking:** No cookies, trackers, or analytics are used.
* **No Backend:** There is no server-side database. Your data stays in your CSV.
* **Open Source:** The entire logic is contained within a single HTML file for transparency.

## 📄 Data Schema

If creating a CSV manually, ensure the following header format:
`date, exercise_type, duration_minutes, notes`

---
*Built for performance and privacy.*
