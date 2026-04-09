export interface Project {
  name: string;
  role: string;
  tech_stack: string[];
  highlights: string[];
}

export interface WorkExp {
  company: string;
  title: string;
  duration: string;
  key_responsibilities: string[];
  achievements: string[];
}

export interface ResumeProfile {
  candidate_name: string;
  years_of_experience: string;
  technical_skills: string[];
  soft_skills: string[];
  projects: Project[];
  work_experiences: WorkExp[];
  education: string[];
  strongest_points: string[];
  certifications: string[];
}

export interface JDRequirement {
  description: string;
  is_required: boolean;
}

export interface JDProfile {
  job_title: string;
  company: string;
  team: string;
  level: string;
  required_skills: string[];
  preferred_skills: string[];
  requirements: JDRequirement[];
  responsibilities: string[];
  interview_focus_areas: string[];
  keywords: string[];
  tech_stack: string[];
  years_experience_required: string;
}

interface StructuredAnalysisResponse<T> {
  structured?: T;
  concise_context?: string;
}

type MaybeStructuredAnalysisResponse<T> =
  | StructuredAnalysisResponse<T>
  | { data?: StructuredAnalysisResponse<T> }
  | null
  | undefined;

export function resolveStructuredAnalysisResponse<T>(
  raw: MaybeStructuredAnalysisResponse<T>,
): StructuredAnalysisResponse<T> | undefined {
  if (!raw) return undefined;
  return 'structured' in raw ? raw : raw.data;
}

export function normalizeResumeProfile(profile: ResumeProfile): ResumeProfile {
  return {
    ...profile,
    technical_skills: profile.technical_skills || [],
    soft_skills: profile.soft_skills || [],
    projects: profile.projects || [],
    work_experiences: profile.work_experiences || [],
    education: profile.education || [],
    strongest_points: profile.strongest_points || [],
    certifications: profile.certifications || [],
  };
}

export function normalizeJDProfile(profile: JDProfile): JDProfile {
  return {
    ...profile,
    required_skills: profile.required_skills || [],
    preferred_skills: profile.preferred_skills || [],
    requirements: profile.requirements || [],
    responsibilities: profile.responsibilities || [],
    interview_focus_areas: profile.interview_focus_areas || [],
    keywords: profile.keywords || [],
    tech_stack: profile.tech_stack || [],
  };
}
