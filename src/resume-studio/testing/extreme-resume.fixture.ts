import type { ResumeData } from '../types/resume-data.types';

export const EXTREME_RESUME_DATA: ResumeData = {
  personal: {
    fullName: 'Mohammad Abdul Rahman Al-Mahmud Chowdhury-Santangelo',
    jobTitle: 'Senior Cross-Platform Mobile Application Architecture and Platform Engineering Specialist',
    email: 'an.extremely.long.but.valid.email.address.for.testing@example-subdomain.example.com',
    location: 'A very long location name used to verify that narrow columns wrap safely without clipping',
    website: 'https://example.com/a/very/long/portfolio/path/that/must/wrap/without/overflowing/the/page',
  },
  summary:
    'Experienced engineer with a deliberately long summary used for regression testing. '.repeat(10).trim(),
  experience: Array.from({ length: 15 }, (_, index) => ({
    company: `International Example Company ${index + 1}`,
    position: `Senior Product Engineer ${index + 1}`,
    location: 'Remote / International',
    startDate: '2020-01',
    endDate: index === 0 ? 'present' : '2024-12',
    isCurrent: index === 0,
    description:
      'A long role description that exercises text wrapping, pagination, and oversize-entry behavior without allowing HTML injection.',
    bullets: Array.from({ length: 8 }, (_, bullet) =>
      `Impact bullet ${bullet + 1}: delivered a measurable product improvement while collaborating across engineering, design, product, and operations.`,
    ),
  })),
  education: Array.from({ length: 10 }, (_, index) => ({
    institution: `Example Institute of Technology ${index + 1}`,
    degree: `Degree ${index + 1}`,
    startDate: '2016',
    endDate: '2020',
  })),
  skills: Array.from({ length: 40 }, (_, index) =>
    `Skill ${index + 1} With A Potentially Long Display Name`,
  ),
  projects: Array.from({ length: 15 }, (_, index) => ({
    name: `Project ${index + 1}`,
    description: 'Project description designed to test repeated sections and page breaks.',
  })),
  languages: Array.from({ length: 10 }, (_, index) => ({
    name: `Language ${index + 1}`,
    proficiency: 'Professional',
  })),
  certifications: Array.from({ length: 15 }, (_, index) => ({
    name: `Certification ${index + 1}`,
    issuer: 'Certification Authority',
    issueDate: '2025-01',
  })),
};
