import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CvDataDto } from './cv-data.dto';

describe('CvDataDto template support fields', () => {
  it('accepts availability, licences, skill proficiency, and additional information', () => {
    const dto = plainToInstance(CvDataDto, {
      fullName: 'Fahid Hasan',
      professionalTitle: 'Warehouse Worker',
      email: 'fahid.hasan@example.com',
      phone: '+39 123 456 7890',
      location: 'Bologna, Italy',
      availability: 'Available immediately',
      drivingLicense: ['Category B'],
      skills: ['Teamwork'],
      skillProficiencies: [{ name: 'Physical work', proficiency: 'Advanced' }],
      additionalInformation: ['Flexible with working hours', 'Own scooter'],
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.availability).toBe('Available immediately');
    expect(dto.drivingLicense).toEqual(['Category B']);
    expect(dto.skillProficiencies?.[0]).toEqual({
      name: 'Physical work',
      proficiency: 'Advanced',
    });
    expect(dto.additionalInformation).toEqual([
      'Flexible with working hours',
      'Own scooter',
    ]);
  });
});
