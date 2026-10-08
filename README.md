# AP Pace Timer

A Chrome extension that starts a countdown the moment an AP Classroom question appears, using a goal time for that subject and question type (MCQ or FRQ).

## Install (2 minutes)

1. Unzip this folder somewhere you won't delete it.
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `ap-pace-timer` folder.
4. Pin it from the puzzle-piece menu. Clicking the icon opens settings.

## How it works

- When a question shows up, it figures out the type: radio-button choices mean MCQ, a big text box or upload area means FRQ.
- It picks the subject by looking for keywords (like "calculus bc") in the page and tab title. You can force a subject from the dropdown on the timer.
- Each question gets its own clock. Go back to Q3 and its time picks up where it left off.
- Green → amber (last 25%) → red and counting up once you're over. Optional double-beep at zero.
- "Banked / behind" is your running balance across the set. Questions you only flipped past for under 15 seconds don't count toward it.
- ☰ shows every question's time vs. goal. "New session" clears them.
- −15s / +15s permanently adjusts the goal for the current subject and type.

Shortcuts (editable at `chrome://extensions/shortcuts`): Alt+Shift+P pause, Alt+Shift+R reset question, Alt+Shift+T flip MCQ/FRQ, Alt+Shift+M minimize.
