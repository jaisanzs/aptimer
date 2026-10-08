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
- Hide mode (the ◐ button, or the checkbox in settings): the clock keeps running but shows `••:••` until you click an answer choice, then reveals how long you took. Alt+Shift+H peeks or re-hides, which is how you reveal it on FRQs. No chime or flash while hidden.
- Once you answer, the timer records your time-to-answer and shows it with a ✓ in the ☰ list, separate from total time on the question.

Shortcuts (editable at `chrome://extensions/shortcuts`): Alt+Shift+P pause, Alt+Shift+R reset question, Alt+Shift+T flip MCQ/FRQ, Alt+Shift+H reveal/re-hide. Minimize has no default key (Chrome allows only four), so assign one there if you want it.

## If detection is off

The question-detection selectors are educated guesses based on how Learnosity (the engine AP Classroom uses) usually structures its HTML. They haven't been tested against a live progress check. Signs something's wrong:

- Timer says "waiting for a question" while you're on one
- All questions share one clock
- MCQ shows as FRQ (press Alt+Shift+T to override per question)

To fix it: on a question, right-click the question text → Inspect, and copy the class names you see on the question, the answer choices and the "Question X of Y" label. The lists to edit are at the top of `content.js` (`STEM_SELECTORS`, `MCQ_SELECTORS`, `FRQ_SELECTORS`, `COUNTER_RE`). After editing, hit the reload arrow on the extension card and refresh AP Classroom.
