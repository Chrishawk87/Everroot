import type { InteractionType } from "@/lib/forest/growth-engine";
import type { LifeEpoch } from "@prisma/client";

/**
 * THE LIFE INTERVIEW
 * ------------------
 * A curated, warm set of questions that walk a person through the chapters of
 * their life. Every answer grows something in the forest: the `interaction`
 * decides what kind of object (leaf, fruit, flower, root) and the `branch` /
 * `epoch` decide where it lands. No AI is required — the script itself is the
 * interviewer. (Adaptive AI follow-ups can layer on top of this later.)
 */

export interface InterviewQuestion {
  /** Stable id, used to track progress. */
  id: string;
  /** Spoken aloud and shown on screen. */
  prompt: string;
  /** A gentle nudge shown beneath the question to help them start. */
  hint?: string;
  /** What this answer grows. */
  interaction: InteractionType;
  /** Which life epoch the memory belongs to. */
  epoch?: LifeEpoch;
  /** Which branch the memory hangs from. */
  branch?: string;
  /** Title given to the memory that grows from this answer. */
  title: string;
}

export interface InterviewChapter {
  id: string;
  title: string;
  /** A short line that sets the tone as the chapter opens. */
  intro: string;
  questions: InterviewQuestion[];
}

export const INTERVIEW: InterviewChapter[] = [
  {
    id: "roots",
    title: "Roots & Beginnings",
    intro: "Let's start at the very beginning — where you come from.",
    questions: [
      {
        id: "roots-where-born",
        prompt: "Where and when were you born, and what do you know about the day you came into the world?",
        hint: "The place, the year, any story your family passed down about your birth.",
        interaction: "family_history",
        epoch: "ROOTS",
        branch: "Roots & Heritage",
        title: "Where I was born",
      },
      {
        id: "roots-parents",
        prompt: "Tell me about your parents. Who were they, and what were they like?",
        hint: "Their names, their work, the things that made them who they were.",
        interaction: "family_history",
        epoch: "ROOTS",
        branch: "Roots & Heritage",
        title: "My parents",
      },
      {
        id: "roots-home",
        prompt: "What was the home you grew up in like?",
        hint: "The sounds, the smells, the rooms, who was around the table.",
        interaction: "record_story",
        epoch: "ROOTS",
        branch: "Childhood Memories",
        title: "The home I grew up in",
      },
    ],
  },
  {
    id: "growing-up",
    title: "Growing Up",
    intro: "Now the years when you were becoming yourself.",
    questions: [
      {
        id: "grow-friend",
        prompt: "Who was your closest friend when you were young, and what did you get up to together?",
        hint: "A name, a place you went, a bit of mischief you still smile about.",
        interaction: "record_story",
        epoch: "FIRST_STEPS",
        branch: "Childhood Memories",
        title: "A childhood friend",
      },
      {
        id: "grow-joy",
        prompt: "What made you happiest as a child?",
        hint: "A hobby, a place, a person, a time of year.",
        interaction: "record_story",
        epoch: "FIRST_STEPS",
        branch: "Favorite Stories",
        title: "What made me happy",
      },
      {
        id: "grow-teacher",
        prompt: "Was there a teacher, mentor, or elder who shaped you? What did they give you?",
        hint: "Something they said or did that you still carry.",
        interaction: "answer_question",
        epoch: "FIRST_STEPS",
        branch: "Favorite Stories",
        title: "Someone who shaped me",
      },
    ],
  },
  {
    id: "love-family",
    title: "Love & Family",
    intro: "The people you chose, and the family you built.",
    questions: [
      {
        id: "love-meet",
        prompt: "If you fell in love, tell me the story of how you met.",
        hint: "Where you were, the first time you noticed them, how you knew.",
        interaction: "major_life_event",
        epoch: "CROSSROADS",
        branch: "Milestones",
        title: "How we met",
      },
      {
        id: "love-children",
        prompt: "Tell me about becoming a parent, or about the children in your life.",
        hint: "The day they arrived, what changed in you, who they became.",
        interaction: "major_life_event",
        epoch: "ANCHORS",
        branch: "Milestones",
        title: "Becoming a parent",
      },
      {
        id: "love-tradition",
        prompt: "What is a family tradition you hope never dies?",
        hint: "A holiday, a meal, a saying, a ritual that means home.",
        interaction: "memory_moment",
        epoch: "ANCHORS",
        branch: "Family Traditions",
        title: "A family tradition",
      },
    ],
  },
  {
    id: "work-purpose",
    title: "Work & Purpose",
    intro: "The work of your hands and the shape of your days.",
    questions: [
      {
        id: "work-what",
        prompt: "What work did you do, and how did you come to it?",
        hint: "Your first job, your calling, the path that led you there.",
        interaction: "record_story",
        epoch: "ANCHORS",
        branch: "Favorite Stories",
        title: "The work I did",
      },
      {
        id: "work-proud",
        prompt: "What accomplishment are you most proud of?",
        hint: "Something you built, finished, or fought for.",
        interaction: "major_life_event",
        epoch: "ANCHORS",
        branch: "Biggest Wins",
        title: "What I'm proud of",
      },
    ],
  },
  {
    id: "trials",
    title: "Trials & Triumphs",
    intro: "The storms you weathered, and what they taught you.",
    questions: [
      {
        id: "trials-hard",
        prompt: "What was the hardest thing you ever lived through, and how did you get to the other side?",
        hint: "Take your time. Only as much as you want to share.",
        interaction: "record_story",
        epoch: "STORMS",
        branch: "Biggest Mistakes",
        title: "A hard season",
      },
      {
        id: "trials-learned",
        prompt: "Looking back, is there a mistake that turned out to teach you the most?",
        hint: "Something you'd do differently, and what it gave you.",
        interaction: "record_story",
        epoch: "STORMS",
        branch: "Biggest Mistakes",
        title: "A lesson learned the hard way",
      },
    ],
  },
  {
    id: "wisdom",
    title: "Wisdom & Messages",
    intro: "And now, the things you most want to pass on.",
    questions: [
      {
        id: "wisdom-advice",
        prompt: "What is the most important piece of advice you'd give the people who come after you?",
        hint: "One thing you know to be true about living well.",
        interaction: "record_advice",
        epoch: "HARVEST",
        branch: "Life Advice",
        title: "My advice",
      },
      {
        id: "wisdom-happiness",
        prompt: "What did you learn about what actually makes a life happy?",
        hint: "What mattered in the end, and what didn't.",
        interaction: "record_advice",
        epoch: "HARVEST",
        branch: "Life Advice",
        title: "On a happy life",
      },
      {
        id: "wisdom-message",
        prompt: "Finally — is there a message you want your family to hear years from now, maybe when you're no longer here?",
        hint: "Speak straight to them. They will be listening.",
        interaction: "memory_moment",
        epoch: "HORIZONS",
        branch: "Messages for Future Generations",
        title: "A message for the future",
      },
    ],
  },
];

/** momentType passed to the growth engine for memory_moment questions. */
export const MOMENT_TYPE_BY_QUESTION: Record<string, string> = {
  "love-tradition": "tradition",
  "wisdom-message": "legacy_message",
};

/** Flat list of every question in order. */
export const ALL_QUESTIONS: InterviewQuestion[] = INTERVIEW.flatMap((c) => c.questions);

export function chapterForQuestion(questionId: string): InterviewChapter | undefined {
  return INTERVIEW.find((c) => c.questions.some((q) => q.id === questionId));
}
