import { Controller, Get, Post, Patch, Param, Body, Query, HttpCode } from '@nestjs/common';

@Controller('api/admin/influencers')
export class AdminInfluencersController {
  @Get('dashboard')
  getDashboard() {
    return {
      success: true,
      message: 'Influencer dashboard retrieved successfully.',
      data: {
        totalPartners: 28,
        activePartners: 24,
        totalLinkedUsers: 4250,
        totalSales: '49450.00',
        lifetimeCommissionEarned: '8560.00',
        totalCommissionOwed: '1450.00',
        pendingPayoutAmount: '450.00',
        paidPayoutAmount: '7110.00',
        currency: 'EUR',
      },
    };
  }

  @Get()
  listPartners(@Query('page') page = '1', @Query('limit') limit = '10') {
    return {
      success: true,
      message: 'Influencer partners retrieved successfully.',
      data: {
        items: [],
        meta: {
          page: Number(page),
          limit: Number(limit),
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    };
  }

  @Post()
  @HttpCode(201)
  createPartner(@Body() body: any) {
    return {
      success: true,
      message: 'Influencer partner created successfully.',
      data: { id: '00000000-0000-0000-0000-000000000000', fullName: body?.fullName ?? 'Jane Doe' },
    };
  }

  @Get(':partnerId')
  getPartner(@Param('partnerId') partnerId: string) {
    return {
      success: true,
      message: 'Influencer partner retrieved.',
      data: {
        partner: {
          id: partnerId ?? '<uuid>',
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          status: 'ACTIVE',
          paymentDisplayLabel: 'DE**1300',
          currency: 'EUR',
          createdAt: new Date().toISOString(),
        },
        socialHandles: [],
        deal: null,
        linkedUsersCount: 0,
      },
    };
  }

  @Patch(':partnerId')
  updatePartner(@Param('partnerId') id: string, @Body() body: any) {
    return {
      success: true,
      message: 'Influencer partner updated successfully.',
      data: { id },
    };
  }

  @Post(':partnerId/payouts')
  @HttpCode(201)
  createPayout(@Param('partnerId') partnerId: string, @Body() body: any) {
    return { success: true, message: 'Payout created.', data: { id: '00000000-0000-0000-0000-000000000000' } };
  }

  @Post(':partnerId/ledger/adjustments')
  @HttpCode(201)
  createLedgerAdjustment(@Param('partnerId') partnerId: string, @Body() body: any) {
    return { success: true, message: 'Ledger adjustment created.', data: { id: '00000000-0000-0000-0000-000000000000' } };
  }

  @Get('export.csv')
  getExport() {
    const csv = 'id,fullName,email,couponCode\n00000000-0000-0000-0000-000000000000,Jane Doe,jane@example.com,JANE10';
    return csv;
  }
}
