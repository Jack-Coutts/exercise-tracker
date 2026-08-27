# Simple Exercise Tracker

A simple, private way to track your workouts and see your progress through "consistency maps" (heatmaps). 

### 🔗 [Click Here to Open the Tracker](https://jack-coutts.github.io/exercise-tracker/)

---

## 🟢 How This Works (The "Privacy First" Way)
Most apps store your personal information on their own computers (the "Cloud"). **This app does not. ** Instead, your data stays in a single file on **your** phone or computer.  Think of the web page as an empty picture frame—you bring the picture (your CSV file), view it, update it, and take it back with you.

### What is a CSV file?
CSV stands for "Comma Separated Values." It is a simple text file that looks like a spreadsheet.  You can open it with Excel, Google Sheets, or even a basic Notepad. In this app, it acts as your **personal workout database**.

---

## 🚀 Quick Start Guide

### 1. Get the Example File
If you want to see how the app looks with data already in it: 
1. Find the file named `example.csv` in the list of files above. 
2. Click on it. 
3. Click the **Download** icon (it looks like an arrow pointing down) to save it to your device.

### 2. How to use the app every day
Because the app doesn't "remember" you (for privacy), you follow this simple 3-step cycle: 

1. **OPEN & UPLOAD:** Open the [Tracker Link](https://jack-coutts.github.io/exercise-tracker/) and tap the "Import" box.  Select your `exercises.csv` file. Your history and maps will instantly appear. 
2. **LOG:** Add your new workout for today (type, minutes, and any notes).
3. **SAVE:** This is the most important step! Tap **Save**. Choose one folder (Chrome, Edge, and other Chromium browsers will offer a folder picker) and the app writes both files there:
   - a CSV of your workout history (your database for next time)
   - a PDF report of your current summary, heatmap, and log

   In browsers without a folder picker, both files still download to your device. You can delete the old CSV once you have the new one.

> ⚠️ **If you close the page without clicking Save, your new entries will not be saved.**

---

## 📱 Using it on your Phone
You can make this feel like a real app by adding it to your home screen:

**On iPhone (Safari):**
1. Tap the **Square with an Up Arrow** at the bottom of the screen. 
2. Scroll down and tap **"Add to Home Screen"**. 

**On Android (Chrome):**
1. Tap the **Three Dots** in the top right corner. 
2. Tap **"Install App"** or **"Add to Home Screen"**.

---

## 🎨 Features

### Custom Exercise Types
The app comes with default exercise types (cycling, gym, squash, running, pilates, swimming), but you can **add your own** in the "Exercise Types" section.  Custom types are saved when you save your CSV.

### Heatmap Intensity Levels
The consistency heatmaps show your daily activity with varying intensity: 

| Color | Minutes Exercised |
|-------|-------------------|
| White | 0 min (no activity) |
| Light Gray | 1–45 min |
| Medium Gray | 46–90 min |
| Dark Gray | 91–135 min |
| Black | 136+ min |

### Summary Statistics
View your exercise breakdown:
- **Total Sessions** — All recorded workouts
- **Total Time** — Combined exercise duration
- **Current Streak** — Consecutive days exercised
- **Longest Streak** — Best streak achieved
- **Longest Break** — Longest gap between workouts
- **Top Exercise** — Most frequently done activity
- **Active Days** — Unique days with exercise
- **Avg min/session** — Average duration per workout
- **Avg sessions/week** — Average workouts per week
- **Avg time/week** — Average time exercised per week

---

## 💡 Pro Tips
* **No Internet Needed:** Once you open the page, you can use it at the gym without a signal. Just remember to save the files before you close the tab! 
* **Reports:** Use **Save** to write a PDF report alongside your CSV—handy for a trainer or a printed log. On Chromium browsers you pick one folder and both files land there; other browsers download both files instead. (Your browser's own print dialog still works if you want a paper copy.)
* **Editing:** If you make a mistake, you can always open your CSV file in Excel, fix the numbers, save it, and upload it back to the app. 
* **Backup:** Keep a copy of your CSV file in cloud storage (iCloud, Google Drive, Dropbox) so you never lose your history.

---

## 🔧 Troubleshooting

### My CSV won't import
- Make sure your file has the correct headers:  `date,exercise_type,duration_minutes,notes`
- Dates must be in `YYYY-MM-DD` format (e.g., `2025-01-15`)
- Duration must be a whole number (no decimals)

### I accidentally closed without saving
Unfortunately, any unsaved entries are lost. This is the trade-off for privacy—no cloud means no automatic backup.  Consider setting a reminder to save after each session.

### The heatmap looks wrong
- Check that your dates are formatted correctly in your CSV
- Future dates won't appear on the current year's heatmap

### I want to merge two CSV files
Open both files in Excel or Google Sheets, copy the rows (without headers) from one file, and paste them at the bottom of the other.  Save and re-import.

---

## 📄 CSV File Format

Your exercise data is stored in this simple format:

```csv
date,exercise_type,duration_minutes,notes
2025-01-15,running,30,"Morning jog in the park"
2025-01-14,gym,45,""
2025-01-13,swimming,60,"Worked on freestyle technique"
```

| Column | Description | Required |
|--------|-------------|----------|
| `date` | Date of exercise (YYYY-MM-DD) | ✅ Yes |
| `exercise_type` | Type of activity (lowercase) | ✅ Yes |
| `duration_minutes` | Length in minutes (whole number) | ✅ Yes |
| `notes` | Optional comments (in quotes if containing commas) | ❌ No |

---

## 🛡️ Privacy Summary

| Question | Answer |
|----------|--------|
| Does this app collect my data? | **No** |
| Is my workout data sent to a server? | **No** |
| Do I need to create an account? | **No** |
| Where is my data stored?  | **Only on your device** |
| Can I use this offline? | **Yes** |

--- 
