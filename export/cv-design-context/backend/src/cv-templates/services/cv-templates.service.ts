import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import { CreateCvTemplateDto } from '../dto/create-cv-template.dto';
import { CvTemplateQueryDto } from '../dto/cv-template-query.dto';
import { CvTemplate } from '../entities/cv-template.entity';

@Injectable()
export class CvTemplatesService {
  constructor(
    @InjectRepository(CvTemplate)
    private readonly cvTemplateRepository: Repository<CvTemplate>,
  ) {}

  async create(dto: CreateCvTemplateDto) {
    const template = this.cvTemplateRepository.create({
      name: dto.name.trim(),
      imageUrl: dto.imageUrl.trim(),
    });

    const savedTemplate = await this.cvTemplateRepository.save(template);

    return {
      message: 'CV template uploaded successfully.',
      template: savedTemplate,
    };
  }

  async findAll(query: CvTemplateQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();

    const [templates, totalItems] =
      await this.cvTemplateRepository.findAndCount({
        where: search
          ? {
              name: ILike(`%${search}%`),
            }
          : {},
        order: {
          createdAt: 'DESC',
        },
        skip: (page - 1) * limit,
        take: limit,
      });

    return {
      templates,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
      },
    };
  }

  async delete(id: string) {
    const template = await this.cvTemplateRepository.findOne({
      where: {
        id,
      },
    });

    if (!template) {
      throw new NotFoundException('CV template not found.');
    }

    await this.cvTemplateRepository.remove(template);

    return {
      message: 'CV template deleted successfully.',
      templateId: id,
    };
  }

  async findById(id: string): Promise<CvTemplate> {
    const template = await this.cvTemplateRepository.findOne({
      where: {
        id,
      },
    });

    if (!template) {
      throw new NotFoundException('CV template not found.');
    }

    return template;
  }
}
