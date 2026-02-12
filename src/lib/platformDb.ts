// Platform Database Access Layer (Hosted Mode Only)
// Stores researcher accounts, encrypted credentials, and study ownership
// Uses the platform host's own Upstash Redis instance

import { getPlatformClient } from './kvClient';
import { ResearcherAccount, ResearcherProfile } from '@/types';

const platform = () => getPlatformClient();

// Key prefix for environment isolation (staging vs production sharing same Redis)
const PREFIX = process.env.PLATFORM_KEY_PREFIX || '';
const key = (k: string) => PREFIX ? `${PREFIX}:${k}` : k;

// ============================================
// Researcher Account CRUD
// ============================================

export async function getResearcherById(id: string): Promise<ResearcherAccount | null> {
  try {
    return await platform().get<ResearcherAccount>(`${key('researcher')}:${id}`);
  } catch (error) {
    console.error('Error getting researcher:', error);
    return null;
  }
}

export async function getResearcherByOAuth(
  provider: string,
  oauthId: string
): Promise<ResearcherAccount | null> {
  try {
    const researcherId = await platform().get<string>(`${key('oauth')}:${provider}:${oauthId}`);
    if (!researcherId) return null;
    return getResearcherById(researcherId);
  } catch (error) {
    console.error('Error getting researcher by OAuth:', error);
    return null;
  }
}

export async function getResearcherByEmail(email: string): Promise<ResearcherAccount | null> {
  try {
    const researcherId = await platform().get<string>(`${key('email')}:${email}`);
    if (!researcherId) return null;
    return getResearcherById(researcherId);
  } catch (error) {
    console.error('Error getting researcher by email:', error);
    return null;
  }
}

export async function saveResearcher(researcher: ResearcherAccount): Promise<boolean> {
  try {
    const p = platform();
    await p.set(`${key('researcher')}:${researcher.id}`, researcher);
    await p.set(`${key('oauth')}:${researcher.oauthProvider}:${researcher.oauthId}`, researcher.id);
    await p.set(`${key('email')}:${researcher.email}`, researcher.id);
    await p.sadd(key('all-researchers'), researcher.id);
    return true;
  } catch (error) {
    console.error('Error saving researcher:', error);
    return false;
  }
}

export async function updateResearcher(
  id: string,
  updates: Partial<ResearcherAccount>
): Promise<boolean> {
  try {
    const researcher = await getResearcherById(id);
    if (!researcher) return false;

    const updated = { ...researcher, ...updates, id: researcher.id };
    await platform().set(`${key('researcher')}:${id}`, updated);
    return true;
  } catch (error) {
    console.error('Error updating researcher:', error);
    return false;
  }
}

// ============================================
// Study Ownership Mapping
// ============================================

export async function registerStudyOwnership(
  studyId: string,
  researcherId: string
): Promise<boolean> {
  try {
    await platform().set(`${key('study-owner')}:${studyId}`, researcherId);
    return true;
  } catch (error) {
    console.error('Error registering study ownership:', error);
    return false;
  }
}

export async function getStudyOwner(studyId: string): Promise<string | null> {
  try {
    return await platform().get<string>(`${key('study-owner')}:${studyId}`);
  } catch (error) {
    console.error('Error getting study owner:', error);
    return null;
  }
}

export async function deleteStudyOwnership(studyId: string): Promise<boolean> {
  try {
    await platform().del(`${key('study-owner')}:${studyId}`);
    return true;
  } catch (error) {
    console.error('Error deleting study ownership:', error);
    return false;
  }
}

// ============================================
// Helpers
// ============================================

// Convert full account to safe client-side profile
export function toResearcherProfile(account: ResearcherAccount): ResearcherProfile {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    avatarUrl: account.avatarUrl,
    onboardingComplete: account.onboardingComplete,
    hasRedisConfigured: !!account.encryptedRedisUrl,
    hasGeminiKey: !!account.encryptedGeminiApiKey,
    hasAnthropicKey: !!account.encryptedAnthropicApiKey,
  };
}
