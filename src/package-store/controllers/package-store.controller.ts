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
  CancelStoreOrderDto,
  CreateStoreOrderDto,
  PublicStorePackageQueryDto,
  StoreOrderHistoryQueryDto,
  StorePackageQuoteQueryDto,
  StoreProviderQueryDto,
  VerifyStoreAppStorePurchaseDto,
  VerifyStoreGooglePlayPurchaseDto,
} from '../dto/package-store.dto';
import { PackageStoreService } from '../services/package-store.service';

@Controller('package-store')
@UseGuards(JwtAuthGuard)
export class PackageStoreController {
  constructor(private readonly packageStoreService: PackageStoreService) {}

  /**
   * Main Shop screen. The provider is required so the API returns only
   * packages that are purchasable on the caller's current app store.
   */
  @Get('shop')
  async getShop(
    @Query() query: StoreProviderQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.getShop(
      this.getUserId(request),
      query.provider,
    );
  }

  /**
   * Dynamic store catalog. Flutter sends google_play on Android and
   * app_store on iOS, then queries the returned product IDs from the store.
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
    @Query() query: StoreProviderQueryDto,
  ) {
    return this.packageStoreService.findPublicPackageById(
      packageId,
      query.provider,
    );
  }

  @Post('orders')
  async createOrder(
    @Body() dto: CreateStoreOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.createOrder(this.getUserId(request), dto);
  }

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

  /**
   * Stable Android contract. During development it uses the guarded local
   * verifier. Later the service implementation is replaced by the Google
   * Play Developer API without changing Flutter's endpoint or payload.
   */
  @Post('orders/:orderId/google-play/verify')
  async verifyGooglePlayPurchase(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Body() dto: VerifyStoreGooglePlayPurchaseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.verifyGooglePlayPurchase({
      userId: this.getUserId(request),
      orderId,
      dto,
    });
  }

  /**
   * Stable iOS contract. It can be exercised with local StoreKit testing in
   * development, then backed by App Store Server API verification later.
   */
  @Post('orders/:orderId/app-store/verify')
  async verifyAppStorePurchase(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Body() dto: VerifyStoreAppStorePurchaseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.verifyAppStorePurchase({
      userId: this.getUserId(request),
      orderId,
      dto,
    });
  }

  @Post('orders/:orderId/cancel')
  async cancelOrder(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Body() dto: CancelStoreOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.packageStoreService.cancelOrder(
      this.getUserId(request),
      orderId,
      dto,
    );
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
