# Dawn & dusk: the morning routine (Nov 9)

Owner's goal: "a beautiful, healthy, vibrant life — even when tired or strapped for time". Mornings often have meetings and work, so flexibility is key; planning the night before works; the earliest wake time matters. Owner picked (round 2 mockups): everything except "a dawn to match the night", with the habit of the week, cards for both evening and morning, and every part switchable in settings. "Very customizable, but every aspect very easy to use."

Brief as revised with the three UX teams: a steady core of stones + one changing slot (the offering card / habit of the week); choose at dusk, at most a few at dawn; one stone = a gentle dawn (a floor, never "missed"); a 2-minute version of each stone for short mornings; log afterwards in one swipe; how it felt as one face; one home (the Dawn path on the welcome screen; the evening plan in Prepare for tomorrow's day).

Owner's paper planners (Google Doc "Daily Planner II", v1/v2) fed the prompts: morning — Today I will be…, Last night I dreamt…, Help from the Universe (journal pills); evening — What did I do right today?, Magical moments, Also super grateful for, Reflections/learnings, What am I looking forward to?, Early morning excitement, Meals planned, Tonight I'd like to dream about; prep — exercise selected, sleep/rise/leave time; "Morning Miracle" (meditation, affirmations, visualization, exercise, reading, journaling) as stone ideas.

Code: `src/lib/dawn.ts` (types, defaults, suggestions, cards, prompts, chapters), actions `dawnAction`, `saveDawnAction`, `dawnDayAction`, `tickDawnAction` (stones tied to a habit tick it; own stones, cards and the week's practice pay 5 XP), `components/dawn/` (DawnPath on the welcome screen, DuskPlan in Prepare for tomorrow's day, DuskEvening "🌙 Tonight" above the evening rites, DawnSettings in Settings › Morning & evening routines and behind each gear). Stored in `life_wheel.dawn`.

Ideas not built yet: the toucan suggesting stones from the morning's calendar; a wake-time alarm/notification; "Tonight I'd like to dream about" shown back in the morning; charts of how mornings felt in Insights.
