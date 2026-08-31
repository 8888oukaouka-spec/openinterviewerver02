/**
 * Interview Greeting Prompt
 *
 * Generates the opening message that welcomes participants to the interview.
 *
 * CUSTOMIZATION GUIDE:
 * - Modify the tone by changing phrases like "warm" or "inviting"
 * - Adjust the structure (e.g., add/remove mention of question count)
 * - Change how profile gathering is introduced
 *
 * KEY VARIABLES:
 * - studyConfig.name: Study title shown to participant
 * - studyConfig.researchQuestion: Main research focus
 * - studyConfig.coreQuestions: List of main questions
 * - studyConfig.profileSchema: Background fields to collect
 */

import { StudyConfig } from '@/types';

/**
 * Build the greeting generation prompt
 *
 * This prompt instructs the AI to create a welcoming opening message
 * that naturally starts gathering participant background information.
 */
export const buildGreetingPrompt = (studyConfig: StudyConfig): string => {
  const profileFieldLabels = studyConfig.profileSchema
    .filter(f => f.required)
    .map(f => f.label.toLowerCase())
    .slice(0, 3);

  return `You are starting a research interview.

Study: ${studyConfig.name}
Research Question: ${studyConfig.researchQuestion}
Number of core questions: ${studyConfig.coreQuestions.length}
Profile info to gather first: ${profileFieldLabels.join(', ')}

Write a warm, brief opening (2-3 sentences) that:
1. Thanks them for participating
2. Mentions you'll have about ${studyConfig.coreQuestions.length} main questions to explore
3. Asks an opening background question that naturally gathers their ${profileFieldLabels[0] || 'background'} and context

Keep it conversational and inviting. Start gathering their profile naturally - don't make it feel like a form.`;
};
