import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { UserRole } from 'src/users/entities/user.entity';
import {
  AdminStoreOrderQueryDto,
  CreateStorePackageDto,
  RefundStoreOrderDto,
  ReorderStorePackagesDto,
  StorePackageQueryDto,
  UpdateCvEconomyConfigDto,
  UpdateStorePackageDto,
} from '../dto/package-store.dto';
import { PackageStoreService } from '../services/package-store.service';

@Controller('admin/package-store')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPackageStoreController {
  constructor(private readonly packageStoreService: PackageStoreService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.packageStoreService.getDashboard();
  }

  @Get('cv-economy')
  async getCvEconomyConfiguration() {
    return this.packageStoreService.getCvEconomyConfig();
  }

  @Put('cv-economy')
  async updateCvEconomyConfiguration(
    @Body() dto: UpdateCvEconomyConfigDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.updateCvEconomyConfig(
      this.getAdminId(request),
      dto,
    );
  }

  @Patch('packages/reorder')
  async reorderPackages(@Body() dto: ReorderStorePackagesDto) {
    return this.packageStoreService.reorderPackages(dto);
  }

  @Post('packages')
  async createPackage(@Body() dto: CreateStorePackageDto) {
    return this.packageStoreService.createPackage(dto);
  }

  @Get('packages')
  async findPackages(@Query() query: StorePackageQueryDto) {
    return this.packageStoreService.findPackages(query);
  }

  @Get('packages/:packageId')
  async findPackageById(
    @Param(
      'packageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    packageId: string,
  ) {
    return this.packageStoreService.findPackageById(packageId);
  }

  @Patch('packages/:packageId')
  async updatePackage(
    @Param(
      'packageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    packageId: string,
    @Body() dto: UpdateStorePackageDto,
  ) {
    return this.packageStoreService.updatePackage(packageId, dto);
  }

  @Delete('packages/:packageId')
  async archivePackage(
    @Param(
      'packageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    packageId: string,
  ) {
    return this.packageStoreService.archivePackage(packageId);
  }

  @Patch('packages/:packageId/restore')
  async restorePackage(
    @Param(
      'packageId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    packageId: string,
  ) {
    return this.packageStoreService.restorePackage(packageId);
  }

  @Get('orders/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="package-store-orders.csv"',
  )
  async exportOrders(@Query() query: AdminStoreOrderQueryDto) {
    return this.packageStoreService.exportOrdersCsv(query);
  }

  @Get('orders')
  async findOrders(@Query() query: AdminStoreOrderQueryDto) {
    return this.packageStoreService.findAdminOrders(query);
  }

  @Get('orders/:orderId/invoice')
  async downloadInvoice(
    @Param(
      'orderId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    orderId: string,
    @Res() response: Response,
  ) {
    const invoice = await this.packageStoreService.getAdminInvoice(orderId);

    response.setHeader('Content-Type', 'text/html; charset=utf-8');

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.fileName}"`,
    );

    response.send(invoice.html);
  }

  @Post('orders/:orderId/demo-refund')
  async refundOrder(
    @Param(
      'orderId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    orderId: string,
    @Body() dto: RefundStoreOrderDto,
  ) {
    return this.packageStoreService.demoRefund(orderId, dto);
  }

  @Get('orders/:orderId')
  async findOrderById(
    @Param(
      'orderId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    orderId: string,
  ) {
    return this.packageStoreService.findAdminOrderById(orderId);
  }

  private getAdminId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin user not found.');
    }

    return id;
  }
}
