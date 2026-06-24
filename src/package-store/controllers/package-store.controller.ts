import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  ConfirmStoreGooglePlayDemoDto,
  ConfirmStoreStripeDemoDto,
  CreateStoreOrderDto,
  PublicStorePackageQueryDto,
  StoreOrderHistoryQueryDto,
  StorePackageQuoteQueryDto,
} from '../dto/package-store.dto';
import { PackageStoreService } from '../services/package-store.service';

@Controller('package-store')
@UseGuards(JwtAuthGuard)
export class PackageStoreController {
  constructor(private readonly packageStoreService: PackageStoreService) {}

  /**
   * Main Shop screen:
   * balances, package summaries and latest-order information.
   */
  @Get('shop')
  async getShop(@Req() request: AuthenticatedRequest) {
    return this.packageStoreService.getShop(this.getUserId(request));
  }

  /**
   * AI Refill, Streak Freeze and CV Credit listing.
   */
  @Get('packages')
  async findPackages(
    @Query() query: PublicStorePackageQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.findPublicPackages(
      this.getUserId(request),
      query,
    );
  }

  @Get('balances')
  async getMyBalances(@Req() request: AuthenticatedRequest) {
    return this.packageStoreService.getMyBalances(this.getUserId(request));
  }

  /**
   * Unified order history:
   * courses, AI refills, streak freezes and CV credits.
   */
  @Get('orders/history')
  async findPurchaseHistory(
    @Query() query: StoreOrderHistoryQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.findPurchaseHistory(
      this.getUserId(request),
      query,
    );
  }

  @Get('packages/:packageId/quote')
  async getQuote(
    @Param('packageId', new ParseUUIDPipe({ version: '4' }))
    packageId: string,
    @Query() query: StorePackageQuoteQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.getQuote(
      this.getUserId(request),
      packageId,
      query,
    );
  }

  @Get('packages/:packageId')
  async findPackageById(
    @Param('packageId', new ParseUUIDPipe({ version: '4' }))
    packageId: string,
  ) {
    return this.packageStoreService.findPublicPackageById(packageId);
  }

  @Post('orders')
  async createOrder(
    @Body() dto: CreateStoreOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.createOrder(this.getUserId(request), dto);
  }

  /**
   * Returns the payment options for the Checkout screen.
   */
  @Get('orders/:orderId/checkout')
  async getCheckout(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.getCheckout(
      this.getUserId(request),
      orderId,
    );
  }

  @Post('orders/:orderId/google-play/demo-confirm')
  async confirmGooglePlayDemo(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Body() dto: ConfirmStoreGooglePlayDemoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.confirmGooglePlayDemo({
      userId: this.getUserId(request),
      orderId,
      dto,
    });
  }

  @Post('orders/:orderId/stripe/demo-confirm')
  async confirmStripeDemo(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Body() dto: ConfirmStoreStripeDemoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.confirmStripeDemo({
      userId: this.getUserId(request),
      orderId,
      dto,
    });
  }

  @Get('orders/:orderId/invoice')
  async downloadInvoice(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const invoice = await this.packageStoreService.getOwnedInvoice(
      this.getUserId(request),
      orderId,
    );

    response.setHeader('Content-Type', 'text/html; charset=utf-8');

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.fileName}"`,
    );

    response.send(invoice.html);
  }

  @Get('orders/:orderId')
  async findOrderById(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.findOwnedOrderById(
      this.getUserId(request),
      orderId,
    );
  }

  private getUserId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return id;
  }
}
