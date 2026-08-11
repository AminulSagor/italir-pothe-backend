export interface ResumePersonalInfo {
  fullName?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  photoFileId?: string;
  photoUrl?: string;
}

export interface ResumeExperienceItem {
  id?: string;
  company?: string;
  position?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  bullets?: string[];
}

export interface ResumeEducationItem {
  id?: string;
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ResumeProjectItem {
  id?: string;
  name?: string;
  role?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  bullets?: string[];
  technologies?: string[];
}

export interface ResumeCertificationItem {
  id?: string;
  name?: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  credentialId?: string;
  credentialUrl?: string;
}

export interface ResumeLanguageItem {
  id?: string;
  name?: string;
  proficiency?: string;
}

export interface ResumeReferenceItem {
  id?: string;
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
}

export interface ResumeData {
  personal?: ResumePersonalInfo;
  summary?: string;
  experience?: ResumeExperienceItem[];
  education?: ResumeEducationItem[];
  skills?: string[];
  projects?: ResumeProjectItem[];
  languages?: ResumeLanguageItem[];
  certifications?: ResumeCertificationItem[];
  references?: ResumeReferenceItem[];
}

export type ResumeDataSectionKey = keyof ResumeData;
