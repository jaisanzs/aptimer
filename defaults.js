// Default pacing, in seconds. Based on real AP exam section timing
// (total section minutes / number of questions). Edit freely in Options.
globalThis.APT_DEFAULTS = {
  subjects: [
    { id: "physc-mech", name: "Physics C: Mechanics",  match: ["physics c: mechanics", "physics c mechanics"], mcq: 120, frq: 1500 },
    { id: "physc-em",   name: "Physics C: E&M",        match: ["physics c: electricity", "electricity and magnetism"], mcq: 120, frq: 1500 },
    { id: "calc-bc",    name: "Calculus BC",           match: ["calculus bc"], mcq: 140, frq: 900 },
    { id: "calc-ab",    name: "Calculus AB",           match: ["calculus ab"], mcq: 140, frq: 900 },
    { id: "chem",       name: "Chemistry",             match: ["ap chemistry"], mcq: 90, frq: 900 },
    { id: "bio",        name: "Biology",               match: ["ap biology"], mcq: 90, frq: 900 },
    { id: "default",    name: "Default",               match: [], mcq: 90, frq: 900 }
  ],
  defaultSubjectId: "default",
  chime: true,
  pauseWhenHidden: false,
  warnAt: 0.25 // turn amber when 25% of the time is left
};
