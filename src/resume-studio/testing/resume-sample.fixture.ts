import type { ResumeData } from '../types/resume-data.types';

export const RESUME_PREVIEW_SAMPLE: ResumeData = {
  personal: {
    fullName: 'Alex Morgan',
    jobTitle: 'Senior Mobile Engineer',
    email: 'alex.morgan@example.com',
    phone: '+39 320 555 0188',
    location: 'Milan, Italy',
    website: 'https://example.com',
    linkedin: 'https://linkedin.com/in/alex-morgan',
    github: 'https://github.com/alex-morgan',
    photoUrl:
      'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect width="100%25" height="100%25" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="54%25" text-anchor="middle" font-size="120" font-family="Arial" fill="%236b7280"%3EAM%3C/text%3E%3C/svg%3E',
  },
  summary:
    'Mobile engineer focused on reliable, accessible products, clean architecture, and measurable product outcomes.',
  experience: [
    {
      company: 'Northstar Labs',
      position: 'Senior Mobile Engineer',
      location: 'Milan, Italy',
      startDate: '2023-03',
      endDate: 'present',
      isCurrent: true,
      bullets: [
        'Led delivery of cross-platform mobile features used by customers across multiple markets.',
        'Improved release reliability through automated testing and observability.',
      ],
    },
    {
      company: 'Orbit Systems',
      position: 'Mobile Engineer',
      startDate: '2020-06',
      endDate: '2023-02',
      bullets: ['Built customer-facing mobile workflows and reusable UI components.'],
    },
  ],
  education: [
    {
      institution: 'Example University',
      degree: 'BSc in Computer Science',
      startDate: '2016',
      endDate: '2020',
    },
  ],
  skills: ['Flutter', 'Dart', 'TypeScript', 'NestJS', 'PostgreSQL', 'REST APIs'],
  projects: [
    {
      name: 'Mobile Commerce Platform',
      role: 'Lead Developer',
      description: 'Built a multi-platform commerce experience with secure checkout and analytics.',
    },
  ],
  languages: [
    { name: 'English', proficiency: 'Professional' },
    { name: 'Italian', proficiency: 'Intermediate' },
  ],
  certifications: [{ name: 'Cloud Developer', issuer: 'Example Certification Body', issueDate: '2025-02' }],
};
