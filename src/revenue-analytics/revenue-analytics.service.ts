import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { CourseStatus } from 'src/module-2/courses/entities/course.entity';
import {
  StorePackageStatus,
  StorePackageType,
} from 'src/package-store/types/package-store.type';

import {
  CoursePerformanceQueryDto,
  PackagePerformanceQueryDto,
  RevenueAnalyticsSearchQueryDto,
  RevenueDateRangeQueryDto,
  RevenueGrowthQueryDto,
  RevenueTransactionsQueryDto,
} from './dto/revenue-analytics-query.dto';
import {
  CoursePerformanceSortBy,
  PackagePerformanceSortBy,
  RevenueDatePreset,
  RevenueGraphRange,
  RevenueSortOrder,
  RevenueSource,
  RevenueTransactionSortBy,
  RevenueTransactionStatus,
} from './types/revenue-analytics.type';

interface ResolvedPeriod {
  preset: RevenueDatePreset;
  from: Date | null;
  to: Date | null;
  previousFrom: Date | null;
  previousTo: Date | null;
}

interface RevenueTotals {
  courseRevenueEur: number;
  packageRevenueEur: number;
  totalRevenueEur: number;
  courseSales: number;
  packageSales: number;
  totalSales: number;
}

interface RawTransactionRow {
  id: string;
  source: RevenueSource;
  orderNumber: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  avatarUrl: string | null;
  itemId: string;
  itemName: string;
  itemType: string;
  amountEur: string;
  paymentAmount: string;
  paymentCurrency: string;
  paymentProvider: string;
  normalizedStatus: RevenueTransactionStatus;
  originalStatus: string;
  transactionAt: Date | string;
}

interface RawCoursePerformanceRow {
  courseId: string;
  courseName: string;
  subtitle: string | null;
  slug: string;
  status: CourseStatus;
  isFree: boolean;
  priceEur: string | null;
  enrollments: string;
  sales: string;
  revenueEur: string;
  lastSaleAt: Date | string | null;
}

interface RawPackagePerformanceRow {
  packageId: string;
  packageName: string;
  description: string | null;
  packageType: StorePackageType;
  status: StorePackageStatus;
  billingModel: string | null;
  sales: string;
  revenueEur: string;
  lastSaleAt: Date | string | null;
}

@Injectable()
export class RevenueAnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  // =========================================================
  // Main analytics overview
  // =========================================================

  async getOverview(query: RevenueDateRangeQueryDto) {
    const period = this.resolvePeriod(query);

    const now = new Date();
    const currentMonthFrom = this.startOfUtcMonth(now);
    const previousMonthFrom = this.addMonths(currentMonthFrom, -1);

    const [lifetime, selected, previous, currentMonth, previousMonth] =
      await Promise.all([
        this.getRevenueTotals({
          from: null,
          to: null,
        }),

        this.getRevenueTotals(period),

        period.previousFrom && period.previousTo
          ? this.getRevenueTotals({
              from: period.previousFrom,
              to: period.previousTo,
            })
          : Promise.resolve(this.emptyTotals()),

        this.getRevenueTotals({
          from: currentMonthFrom,
          to: now,
        }),

        this.getRevenueTotals({
          from: previousMonthFrom,
          to: currentMonthFrom,
        }),
      ]);

    return {
      currency: 'EUR',

      period: this.serializePeriod(period),

      cards: {
        totalLifetimeRevenue: {
          amount: this.money(lifetime.totalRevenueEur),

          periodChangePercentage: this.percentageChange(
            previous.totalRevenueEur,
            selected.totalRevenueEur,
          ),
        },

        revenueThisMonth: {
          amount: this.money(currentMonth.totalRevenueEur),

          changePercentage: this.percentageChange(
            previousMonth.totalRevenueEur,
            currentMonth.totalRevenueEur,
          ),
        },

        courseRevenue: {
          amount: this.money(selected.courseRevenueEur),

          sales: selected.courseSales,

          percentageOfPeriodRevenue: this.percentageOf(
            selected.courseRevenueEur,
            selected.totalRevenueEur,
          ),
        },

        allPackagesRevenue: {
          amount: this.money(selected.packageRevenueEur),

          sales: selected.packageSales,

          percentageOfPeriodRevenue: this.percentageOf(
            selected.packageRevenueEur,
            selected.totalRevenueEur,
          ),
        },
      },

      selectedPeriodTotals: {
        courseRevenueEur: this.money(selected.courseRevenueEur),
        packageRevenueEur: this.money(selected.packageRevenueEur),
        totalRevenueEur: this.money(selected.totalRevenueEur),

        courseSales: selected.courseSales,
        packageSales: selected.packageSales,
        totalSales: selected.totalSales,
      },

      generatedAt: now.toISOString(),
      timezone: 'UTC',
    };
  }

  // =========================================================
  // Revenue graph
  // =========================================================

  async getGrowth(query: RevenueGrowthQueryDto) {
    const range = query.range ?? RevenueGraphRange.WEEK;

    const config = this.getGrowthConfiguration(range);

    const sql = `
      WITH buckets AS (
        SELECT generate_series(
          $1::timestamptz,
          $2::timestamptz - INTERVAL '${config.step}',
          INTERVAL '${config.step}'
        ) AS bucket_start
      ),

      transactions AS (
        SELECT
          'course'::text AS source,
          "paidAt" AS transaction_at,
          "payableAmountEur"::numeric AS amount_eur
        FROM "course_purchase_orders"
        WHERE status = 'paid'
          AND "paidAt" IS NOT NULL
          AND "paidAt" >= $1
          AND "paidAt" < $2

        UNION ALL

        SELECT
          'package'::text AS source,
          payment."paidAt" AS transaction_at,
          pricing."totalAmountEur"::numeric AS amount_eur
        FROM "store_orders" store_order
        INNER JOIN "store_order_pricing" pricing
          ON pricing."orderId" = store_order.id
        INNER JOIN "store_order_payments" payment
          ON payment."orderId" = store_order.id
        WHERE store_order.status = 'completed'
          AND payment."paidAt" IS NOT NULL
          AND payment."paidAt" >= $1
          AND payment."paidAt" < $2
      )

      SELECT
        bucket.bucket_start AS "bucketStart",

        COALESCE(
          SUM(transaction.amount_eur)
            FILTER (WHERE transaction.source = 'course'),
          0
        )::text AS "courseRevenueEur",

        COALESCE(
          SUM(transaction.amount_eur)
            FILTER (WHERE transaction.source = 'package'),
          0
        )::text AS "packageRevenueEur",

        COALESCE(
          SUM(transaction.amount_eur),
          0
        )::text AS "totalRevenueEur",

        COUNT(transaction.transaction_at)::int AS "transactionCount"

      FROM buckets bucket

      LEFT JOIN transactions transaction
        ON DATE_TRUNC(
          '${config.truncateUnit}',
          transaction.transaction_at
        ) = bucket.bucket_start

      GROUP BY bucket.bucket_start
      ORDER BY bucket.bucket_start ASC
    `;

    const rows = (await this.dataSource.query(sql, [
      config.from,
      config.to,
    ])) as Array<{
      bucketStart: Date | string;
      courseRevenueEur: string;
      packageRevenueEur: string;
      totalRevenueEur: string;
      transactionCount: number | string;
    }>;

    let cumulativeRevenue = 0;

    const points = rows.map((row) => {
      const bucketDate = new Date(row.bucketStart);
      const totalRevenue = Number(row.totalRevenueEur) || 0;

      cumulativeRevenue += totalRevenue;

      return {
        bucketStart: bucketDate.toISOString(),

        label: this.formatGrowthLabel(bucketDate, range),

        courseRevenueEur: this.money(Number(row.courseRevenueEur)),

        packageRevenueEur: this.money(Number(row.packageRevenueEur)),

        totalRevenueEur: this.money(totalRevenue),

        cumulativeRevenueEur: this.money(cumulativeRevenue),

        transactionCount: Number(row.transactionCount) || 0,
      };
    });

    return {
      range,
      currency: 'EUR',

      from: config.from.toISOString(),
      to: config.to.toISOString(),

      points,

      totals: {
        revenueEur: this.money(
          points.reduce(
            (total, point) => total + Number(point.totalRevenueEur),
            0,
          ),
        ),

        transactions: points.reduce(
          (total, point) => total + point.transactionCount,
          0,
        ),
      },

      timezone: 'UTC',
    };
  }

  // =========================================================
  // Transactions
  // =========================================================

  async getTransactions(query: RevenueTransactionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const source = query.source ?? RevenueSource.ALL;

    const status = query.status ?? RevenueTransactionStatus.SUCCESSFUL;

    const sortBy = query.sortBy ?? RevenueTransactionSortBy.TRANSACTION_AT;

    const sortOrder = query.sortOrder ?? RevenueSortOrder.DESC;

    const search = query.search?.trim() || null;
    const period = this.resolvePeriod(query);

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (period.from) {
      params.push(period.from);

      conditions.push(`transaction.transaction_at >= $${params.length}`);
    }

    if (period.to) {
      params.push(period.to);

      conditions.push(`transaction.transaction_at < $${params.length}`);
    }

    if (source !== RevenueSource.ALL) {
      params.push(source);

      conditions.push(`transaction.source = $${params.length}`);
    }

    if (status !== RevenueTransactionStatus.ALL) {
      params.push(status);

      conditions.push(`transaction.normalized_status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);

      const index = params.length;

      conditions.push(`
        (
          transaction.order_number ILIKE $${index}
          OR transaction.item_name ILIKE $${index}
          OR CAST(transaction.user_id AS TEXT) ILIKE $${index}
          OR COALESCE(live_user."fullName", deleted_user."displayName", 'Deleted User')
             ILIKE $${index}
          OR COALESCE(live_user.email, '') ILIKE $${index}
        )
      `);
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const transactionCte = this.getTransactionCte();

    const countRows = (await this.dataSource.query(
      `
        ${transactionCte}

        SELECT COUNT(*)::int AS total
        FROM transactions transaction

        LEFT JOIN users live_user
          ON live_user.id = transaction.user_id

        LEFT JOIN deleted_user_audits deleted_user
          ON deleted_user."originalUserId" = transaction.user_id

        ${whereSql}
      `,
      params,
    )) as Array<{ total: number | string }>;

    const total = Number(countRows[0]?.total ?? 0);

    const sortMap: Record<RevenueTransactionSortBy, string> = {
      [RevenueTransactionSortBy.TRANSACTION_AT]: 'transaction.transaction_at',

      [RevenueTransactionSortBy.AMOUNT]: 'transaction.amount_eur',

      [RevenueTransactionSortBy.ORDER_NUMBER]: 'transaction.order_number',

      [RevenueTransactionSortBy.USER_NAME]: `COALESCE(
          live_user."fullName",
          deleted_user."displayName",
          'Deleted User'
        )`,

      [RevenueTransactionSortBy.ITEM_NAME]: 'transaction.item_name',
    };

    const dataParams = [...params];

    dataParams.push(limit);
    const limitParameter = dataParams.length;

    dataParams.push((page - 1) * limit);
    const offsetParameter = dataParams.length;

    const rows = (await this.dataSource.query(
      `
        ${transactionCte}

        SELECT
          transaction.id,
          transaction.source,
          transaction.order_number AS "orderNumber",
          transaction.user_id AS "userId",

          COALESCE(
            live_user."fullName",
            deleted_user."displayName",
            'Deleted User'
          ) AS "userName",

          live_user.email AS "userEmail",
          live_user."avatarUrl" AS "avatarUrl",

          transaction.item_id AS "itemId",
          transaction.item_name AS "itemName",
          transaction.item_type AS "itemType",

          transaction.amount_eur::text AS "amountEur",
          transaction.payment_amount::text AS "paymentAmount",
          transaction.payment_currency AS "paymentCurrency",
          transaction.payment_provider AS "paymentProvider",

          transaction.normalized_status AS "normalizedStatus",
          transaction.original_status AS "originalStatus",
          transaction.transaction_at AS "transactionAt"

        FROM transactions transaction

        LEFT JOIN users live_user
          ON live_user.id = transaction.user_id

        LEFT JOIN deleted_user_audits deleted_user
          ON deleted_user."originalUserId" = transaction.user_id

        ${whereSql}

        ORDER BY
          ${sortMap[sortBy]} ${sortOrder},
          transaction.id ASC

        LIMIT $${limitParameter}
        OFFSET $${offsetParameter}
      `,
      dataParams,
    )) as RawTransactionRow[];

    return {
      items: rows.map((row) => ({
        id: row.id,
        source: row.source,
        orderNumber: row.orderNumber,

        user: {
          id: row.userId,
          name: row.userName,
          email: row.userEmail,
          avatarUrl: row.avatarUrl,
          deleted: row.userName === 'Deleted User',
        },

        item: {
          id: row.itemId,
          name: row.itemName,
          type: row.itemType,
        },

        normalizedAmount: {
          currency: 'EUR',
          amount: this.money(Number(row.amountEur)),
        },

        chargedAmount: {
          currency: row.paymentCurrency,
          amount: row.paymentAmount,
        },

        paymentProvider: row.paymentProvider,

        status: row.normalizedStatus,
        originalStatus: row.originalStatus,

        transactionAt: new Date(row.transactionAt).toISOString(),
      })),

      meta: this.buildMeta(page, limit, total),

      appliedFilters: {
        search,
        source,
        status,
        sortBy,
        sortOrder,
        period: this.serializePeriod(period),
      },
    };
  }

  // =========================================================
  // Course performance
  // =========================================================

  async getCourseOverview(query: RevenueDateRangeQueryDto) {
    const period = this.resolvePeriod(query);

    const [lifetime, selected, previous, listingRows, bestRows] =
      await Promise.all([
        this.getRevenueTotals({
          from: null,
          to: null,
        }),

        this.getRevenueTotals(period),

        period.previousFrom && period.previousTo
          ? this.getRevenueTotals({
              from: period.previousFrom,
              to: period.previousTo,
            })
          : Promise.resolve(this.emptyTotals()),

        this.dataSource.query(`
          SELECT
            COUNT(*)::int AS total,

            COUNT(*) FILTER (
              WHERE status = 'published'
            )::int AS active

          FROM courses
        `),

        this.getBestSellingCourse(period),
      ]);

    const listing = (
      listingRows as Array<{
        total: number | string;
        active: number | string;
      }>
    )[0];

    return {
      currency: 'EUR',
      period: this.serializePeriod(period),

      cards: {
        totalCourseRevenue: {
          lifetimeAmount: this.money(lifetime.courseRevenueEur),

          periodAmount: this.money(selected.courseRevenueEur),

          changePercentage: this.percentageChange(
            previous.courseRevenueEur,
            selected.courseRevenueEur,
          ),
        },

        bestSellingCourse: bestRows ?? null,

        courseListing: {
          total: Number(listing?.total ?? 0),
          active: Number(listing?.active ?? 0),
        },
      },

      generatedAt: new Date().toISOString(),
    };
  }

  async getCoursePerformance(query: CoursePerformanceQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const result = await this.queryCoursePerformance(query, {
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: result.items,
      meta: this.buildMeta(page, limit, result.total),

      appliedFilters: {
        search: query.search?.trim() || null,
        status: query.status ?? null,

        sortBy: query.sortBy ?? CoursePerformanceSortBy.REVENUE,

        sortOrder: query.sortOrder ?? RevenueSortOrder.DESC,

        period: this.serializePeriod(this.resolvePeriod(query)),
      },
    };
  }

  async exportCoursePerformanceCsv(query: CoursePerformanceQueryDto) {
    const result = await this.queryCoursePerformance(query, null);

    const rows = result.items.map((item) => [
      item.courseId,
      item.courseName,
      item.status,
      item.isFree ? 'Yes' : 'No',
      item.enrollments,
      item.sales,
      item.revenueEur,
      item.lastSaleAt ?? '',
    ]);

    return this.createCsv(
      [
        'Course ID',
        'Course Name',
        'Status',
        'Free Course',
        'Enrollments',
        'Sales',
        'Revenue EUR',
        'Last Sale',
      ],
      rows,
    );
  }

  // =========================================================
  // Package performance
  // =========================================================

  async getPackageOverview(query: RevenueDateRangeQueryDto) {
    const period = this.resolvePeriod(query);

    const now = new Date();
    const currentMonthFrom = this.startOfUtcMonth(now);
    const previousMonthFrom = this.addMonths(currentMonthFrom, -1);

    const [
      lifetime,
      selected,
      currentMonth,
      previousMonth,
      bestSeller,
      packageCountRows,
    ] = await Promise.all([
      this.getRevenueTotals({
        from: null,
        to: null,
      }),

      this.getRevenueTotals(period),

      this.getRevenueTotals({
        from: currentMonthFrom,
        to: now,
      }),

      this.getRevenueTotals({
        from: previousMonthFrom,
        to: currentMonthFrom,
      }),

      this.getBestSellingPackage(period),

      this.dataSource.query(`
        SELECT
          COUNT(*)::int AS total,

          COUNT(*) FILTER (
            WHERE status = 'published'
          )::int AS published,

          COUNT(*) FILTER (
            WHERE status = 'archived'
          )::int AS archived

        FROM store_packages
      `),
    ]);

    const packageCounts = (
      packageCountRows as Array<{
        total: number | string;
        published: number | string;
        archived: number | string;
      }>
    )[0];

    return {
      currency: 'EUR',
      period: this.serializePeriod(period),

      cards: {
        totalPackageRevenue: {
          amount: this.money(lifetime.packageRevenueEur),

          periodChangePercentage: this.percentageChange(
            0,
            selected.packageRevenueEur,
          ),
        },

        revenueThisMonth: {
          amount: this.money(currentMonth.packageRevenueEur),

          changePercentage: this.percentageChange(
            previousMonth.packageRevenueEur,
            currentMonth.packageRevenueEur,
          ),
        },

        // Included because this card exists in the supplied Figma.
        courseRevenue: {
          amount: this.money(selected.courseRevenueEur),
        },

        packageRevenueInSelectedPeriod: {
          amount: this.money(selected.packageRevenueEur),
        },

        bestSeller: bestSeller ?? null,
      },

      packageCounts: {
        total: Number(packageCounts?.total ?? 0),

        published: Number(packageCounts?.published ?? 0),

        archived: Number(packageCounts?.archived ?? 0),
      },

      generatedAt: new Date().toISOString(),
    };
  }

  async getPackagePerformance(query: PackagePerformanceQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const result = await this.queryPackagePerformance(query, {
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: result.items,
      meta: this.buildMeta(page, limit, result.total),

      appliedFilters: {
        search: query.search?.trim() || null,
        packageType: query.packageType ?? null,
        status: query.status ?? null,

        sortBy: query.sortBy ?? PackagePerformanceSortBy.REVENUE,

        sortOrder: query.sortOrder ?? RevenueSortOrder.DESC,

        period: this.serializePeriod(this.resolvePeriod(query)),
      },
    };
  }

  async exportPackagePerformanceCsv(query: PackagePerformanceQueryDto) {
    const result = await this.queryPackagePerformance(query, null);

    const rows = result.items.map((item) => [
      item.packageId,
      item.packageName,
      item.packageType,
      item.billingModel ?? '',
      item.status,
      item.sales,
      item.revenueEur,
      item.lastSaleAt ?? '',
    ]);

    return this.createCsv(
      [
        'Package ID',
        'Package Name',
        'Package Type',
        'Billing Model',
        'Status',
        'Sales',
        'Revenue EUR',
        'Last Sale',
      ],
      rows,
    );
  }

  // =========================================================
  // Global analytics search
  // =========================================================

  async searchAnalytics(query: RevenueAnalyticsSearchQueryDto) {
    const limit = query.limit ?? 5;
    const search = `%${query.search.trim()}%`;

    const [courses, packages, transactions] = await Promise.all([
      this.dataSource.query(
        `
            SELECT
              id,
              title AS name,
              subtitle,
              status,
              'course'::text AS type
            FROM courses
            WHERE
              title ILIKE $1
              OR COALESCE(subtitle, '') ILIKE $1
              OR slug ILIKE $1
            ORDER BY title ASC
            LIMIT $2
          `,
        [search, limit],
      ),

      this.dataSource.query(
        `
            SELECT
              id,
              name,
              description AS subtitle,
              status,
              "packageType"::text AS type
            FROM store_packages
            WHERE
              name ILIKE $1
              OR COALESCE(description, '') ILIKE $1
            ORDER BY name ASC
            LIMIT $2
          `,
        [search, limit],
      ),

      this.getTransactions({
        page: 1,
        limit,
        search: query.search,
        preset: RevenueDatePreset.ALL_TIME,
        source: RevenueSource.ALL,
        status: RevenueTransactionStatus.ALL,
        sortBy: RevenueTransactionSortBy.TRANSACTION_AT,
        sortOrder: RevenueSortOrder.DESC,
      }),
    ]);

    return {
      search: query.search,

      courses,
      packages,
      transactions: transactions.items,
    };
  }

  // =========================================================
  // Private course query
  // =========================================================

  private async queryCoursePerformance(
    query: CoursePerformanceQueryDto,
    pagination: {
      limit: number;
      offset: number;
    } | null,
  ) {
    const period = this.resolvePeriod(query);

    const params: unknown[] = [];
    const salesDateConditions: string[] = [];
    const outerConditions: string[] = [];

    if (period.from) {
      params.push(period.from);

      salesDateConditions.push(`"paidAt" >= $${params.length}`);
    }

    if (period.to) {
      params.push(period.to);

      salesDateConditions.push(`"paidAt" < $${params.length}`);
    }

    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);

      const index = params.length;

      outerConditions.push(`
        (
          course.title ILIKE $${index}
          OR COALESCE(course.subtitle, '') ILIKE $${index}
          OR course.slug ILIKE $${index}
        )
      `);
    }

    if (query.status) {
      params.push(query.status);

      outerConditions.push(`course.status = $${params.length}`);
    }

    const salesDateSql =
      salesDateConditions.length > 0
        ? `AND ${salesDateConditions.join(' AND ')}`
        : '';

    const whereSql =
      outerConditions.length > 0
        ? `WHERE ${outerConditions.join(' AND ')}`
        : '';

    const baseCte = `
      WITH enrollment_users AS (
        SELECT
          "courseId",
          "userId"
        FROM course_enrollments
        WHERE status = 'active'

        UNION

        SELECT
          "courseId",
          "userId"
        FROM user_course_enrollments
      ),

      enrollment_totals AS (
        SELECT
          "courseId",
          COUNT(*)::int AS enrollments
        FROM enrollment_users
        GROUP BY "courseId"
      ),

      sales_totals AS (
        SELECT
          "courseId",

          COUNT(*)::int AS sales,

          COALESCE(
            SUM("payableAmountEur"),
            0
          )::text AS revenue_eur,

          MAX("paidAt") AS last_sale_at

        FROM course_purchase_orders

        WHERE status = 'paid'
          AND "paidAt" IS NOT NULL
          ${salesDateSql}

        GROUP BY "courseId"
      )
    `;

    const countRows = (await this.dataSource.query(
      `
        ${baseCte}

        SELECT COUNT(*)::int AS total
        FROM courses course

        LEFT JOIN enrollment_totals enrollment
          ON enrollment."courseId" = course.id

        LEFT JOIN sales_totals sales
          ON sales."courseId" = course.id

        ${whereSql}
      `,
      params,
    )) as Array<{ total: number | string }>;

    const total = Number(countRows[0]?.total ?? 0);

    const sortBy = query.sortBy ?? CoursePerformanceSortBy.REVENUE;

    const sortOrder = query.sortOrder ?? RevenueSortOrder.DESC;

    const sortMap: Record<CoursePerformanceSortBy, string> = {
      [CoursePerformanceSortBy.COURSE_NAME]: 'course.title',

      [CoursePerformanceSortBy.ENROLLMENTS]:
        'COALESCE(enrollment.enrollments, 0)',

      [CoursePerformanceSortBy.SALES]: 'COALESCE(sales.sales, 0)',

      [CoursePerformanceSortBy.REVENUE]: `COALESCE(
          sales.revenue_eur::numeric,
          0
        )`,

      [CoursePerformanceSortBy.LAST_SALE]: 'sales.last_sale_at',
    };

    const dataParams = [...params];

    let paginationSql = '';

    if (pagination) {
      dataParams.push(pagination.limit);
      const limitParameter = dataParams.length;

      dataParams.push(pagination.offset);
      const offsetParameter = dataParams.length;

      paginationSql = `
        LIMIT $${limitParameter}
        OFFSET $${offsetParameter}
      `;
    }

    const rows = (await this.dataSource.query(
      `
        ${baseCte}

        SELECT
          course.id AS "courseId",
          course.title AS "courseName",
          course.subtitle,
          course.slug,
          course.status,
          course."isFree",
          course.price::text AS "priceEur",

          COALESCE(
            enrollment.enrollments,
            0
          )::text AS enrollments,

          COALESCE(
            sales.sales,
            0
          )::text AS sales,

          COALESCE(
            sales.revenue_eur,
            '0'
          )::text AS "revenueEur",

          sales.last_sale_at AS "lastSaleAt"

        FROM courses course

        LEFT JOIN enrollment_totals enrollment
          ON enrollment."courseId" = course.id

        LEFT JOIN sales_totals sales
          ON sales."courseId" = course.id

        ${whereSql}

        ORDER BY
          ${sortMap[sortBy]} ${sortOrder} NULLS LAST,
          course.id ASC

        ${paginationSql}
      `,
      dataParams,
    )) as RawCoursePerformanceRow[];

    return {
      total,

      items: rows.map((row) => ({
        courseId: row.courseId,
        courseName: row.courseName,
        subtitle: row.subtitle,
        slug: row.slug,
        status: row.status,
        isFree: row.isFree,
        priceEur: row.priceEur,

        enrollments: Number(row.enrollments),
        sales: Number(row.sales),

        currency: 'EUR',
        revenueEur: this.money(Number(row.revenueEur)),

        lastSaleAt: row.lastSaleAt
          ? new Date(row.lastSaleAt).toISOString()
          : null,
      })),
    };
  }

  // =========================================================
  // Private package query
  // =========================================================

  private async queryPackagePerformance(
    query: PackagePerformanceQueryDto,
    pagination: {
      limit: number;
      offset: number;
    } | null,
  ) {
    const period = this.resolvePeriod(query);

    const params: unknown[] = [];
    const salesDateConditions: string[] = [];
    const outerConditions: string[] = [];

    if (period.from) {
      params.push(period.from);

      salesDateConditions.push(`payment."paidAt" >= $${params.length}`);
    }

    if (period.to) {
      params.push(period.to);

      salesDateConditions.push(`payment."paidAt" < $${params.length}`);
    }

    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);

      const index = params.length;

      outerConditions.push(`
        (
          package.name ILIKE $${index}
          OR COALESCE(package.description, '') ILIKE $${index}
        )
      `);
    }

    if (query.packageType) {
      params.push(query.packageType);

      outerConditions.push(`package."packageType" = $${params.length}`);
    }

    if (query.status) {
      params.push(query.status);

      outerConditions.push(`package.status = $${params.length}`);
    }

    const salesDateSql =
      salesDateConditions.length > 0
        ? `AND ${salesDateConditions.join(' AND ')}`
        : '';

    const whereSql =
      outerConditions.length > 0
        ? `WHERE ${outerConditions.join(' AND ')}`
        : '';

    const baseCte = `
      WITH sales_totals AS (
        SELECT
          store_order."packageId",

          COUNT(*)::int AS sales,

          COALESCE(
            SUM(pricing."totalAmountEur"),
            0
          )::text AS revenue_eur,

          MAX(payment."paidAt") AS last_sale_at

        FROM store_orders store_order

        INNER JOIN store_order_pricing pricing
          ON pricing."orderId" = store_order.id

        INNER JOIN store_order_payments payment
          ON payment."orderId" = store_order.id

        WHERE store_order.status = 'completed'
          AND payment."paidAt" IS NOT NULL
          ${salesDateSql}

        GROUP BY store_order."packageId"
      )
    `;

    const countRows = (await this.dataSource.query(
      `
        ${baseCte}

        SELECT COUNT(*)::int AS total
        FROM store_packages package

        LEFT JOIN store_package_commerce commerce
          ON commerce."packageId" = package.id

        LEFT JOIN sales_totals sales
          ON sales."packageId" = package.id

        ${whereSql}
      `,
      params,
    )) as Array<{ total: number | string }>;

    const total = Number(countRows[0]?.total ?? 0);

    const sortBy = query.sortBy ?? PackagePerformanceSortBy.REVENUE;

    const sortOrder = query.sortOrder ?? RevenueSortOrder.DESC;

    const sortMap: Record<PackagePerformanceSortBy, string> = {
      [PackagePerformanceSortBy.PACKAGE_NAME]: 'package.name',

      [PackagePerformanceSortBy.PACKAGE_TYPE]: 'package."packageType"',

      [PackagePerformanceSortBy.SALES]: 'COALESCE(sales.sales, 0)',

      [PackagePerformanceSortBy.REVENUE]: `COALESCE(
          sales.revenue_eur::numeric,
          0
        )`,

      [PackagePerformanceSortBy.LAST_SALE]: 'sales.last_sale_at',
    };

    const dataParams = [...params];

    let paginationSql = '';

    if (pagination) {
      dataParams.push(pagination.limit);
      const limitParameter = dataParams.length;

      dataParams.push(pagination.offset);
      const offsetParameter = dataParams.length;

      paginationSql = `
        LIMIT $${limitParameter}
        OFFSET $${offsetParameter}
      `;
    }

    const rows = (await this.dataSource.query(
      `
        ${baseCte}

        SELECT
          package.id AS "packageId",
          package.name AS "packageName",
          package.description,
          package."packageType"::text AS "packageType",
          package.status::text AS status,

          commerce."billingModel"::text AS "billingModel",

          COALESCE(
            sales.sales,
            0
          )::text AS sales,

          COALESCE(
            sales.revenue_eur,
            '0'
          )::text AS "revenueEur",

          sales.last_sale_at AS "lastSaleAt"

        FROM store_packages package

        LEFT JOIN store_package_commerce commerce
          ON commerce."packageId" = package.id

        LEFT JOIN sales_totals sales
          ON sales."packageId" = package.id

        ${whereSql}

        ORDER BY
          ${sortMap[sortBy]} ${sortOrder} NULLS LAST,
          package.id ASC

        ${paginationSql}
      `,
      dataParams,
    )) as RawPackagePerformanceRow[];

    return {
      total,

      items: rows.map((row) => ({
        packageId: row.packageId,
        packageName: row.packageName,
        description: row.description,
        packageType: row.packageType,
        status: row.status,
        billingModel: row.billingModel,

        sales: Number(row.sales),

        currency: 'EUR',
        revenueEur: this.money(Number(row.revenueEur)),

        lastSaleAt: row.lastSaleAt
          ? new Date(row.lastSaleAt).toISOString()
          : null,
      })),
    };
  }

  // =========================================================
  // Best sellers
  // =========================================================

  private async getBestSellingCourse(period: ResolvedPeriod) {
    const params: unknown[] = [];
    const dateConditions: string[] = [];

    if (period.from) {
      params.push(period.from);

      dateConditions.push(`purchase_order."paidAt" >= $${params.length}`);
    }

    if (period.to) {
      params.push(period.to);

      dateConditions.push(`purchase_order."paidAt" < $${params.length}`);
    }

    const dateSql =
      dateConditions.length > 0 ? `AND ${dateConditions.join(' AND ')}` : '';

    const rows = (await this.dataSource.query(
      `
      SELECT
        course.id,
        course.title,
        course.subtitle,

        COUNT(
          purchase_order.id
        )::int AS sales,

        COALESCE(
          SUM(
            purchase_order."payableAmountEur"
          ),
          0
        )::text AS "revenueEur"

      FROM course_purchase_orders purchase_order

      INNER JOIN courses course
        ON course.id = purchase_order."courseId"

      WHERE purchase_order.status = 'paid'
        AND purchase_order."paidAt" IS NOT NULL
        ${dateSql}

      GROUP BY
        course.id,
        course.title,
        course.subtitle

      ORDER BY
        COUNT(
          purchase_order.id
        ) DESC,

        COALESCE(
          SUM(
            purchase_order."payableAmountEur"
          ),
          0
        ) DESC,

        course.id ASC

      LIMIT 1
    `,
      params,
    )) as Array<{
      id: string;
      title: string;
      subtitle: string | null;
      sales: number | string;
      revenueEur: string;
    }>;

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.title,
      subtitle: row.subtitle,
      sales: Number(row.sales) || 0,
      revenueEur: this.money(Number(row.revenueEur) || 0),
    };
  }

  private async getBestSellingPackage(period: ResolvedPeriod) {
    const params: unknown[] = [];
    const dateConditions: string[] = [];

    if (period.from) {
      params.push(period.from);

      dateConditions.push(`payment."paidAt" >= $${params.length}`);
    }

    if (period.to) {
      params.push(period.to);

      dateConditions.push(`payment."paidAt" < $${params.length}`);
    }

    const dateSql =
      dateConditions.length > 0 ? `AND ${dateConditions.join(' AND ')}` : '';

    const rows = (await this.dataSource.query(
      `
      SELECT
        package.id,
        package.name,

        package."packageType"::text
          AS "packageType",

        COUNT(
          store_order.id
        )::int AS sales,

        COALESCE(
          SUM(
            pricing."totalAmountEur"
          ),
          0
        )::text AS "revenueEur"

      FROM store_orders store_order

      INNER JOIN store_packages package
        ON package.id = store_order."packageId"

      INNER JOIN store_order_pricing pricing
        ON pricing."orderId" = store_order.id

      INNER JOIN store_order_payments payment
        ON payment."orderId" = store_order.id

      WHERE store_order.status = 'completed'
        AND payment."paidAt" IS NOT NULL
        ${dateSql}

      GROUP BY
        package.id,
        package.name,
        package."packageType"

      ORDER BY
        COUNT(
          store_order.id
        ) DESC,

        COALESCE(
          SUM(
            pricing."totalAmountEur"
          ),
          0
        ) DESC,

        package.id ASC

      LIMIT 1
    `,
      params,
    )) as Array<{
      id: string;
      name: string;
      packageType: StorePackageType;
      sales: number | string;
      revenueEur: string;
    }>;

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      packageType: row.packageType,
      sales: Number(row.sales) || 0,
      revenueEur: this.money(Number(row.revenueEur) || 0),
    };
  }

  // =========================================================
  // Revenue totals
  // =========================================================

  private async getRevenueTotals(period: {
    from: Date | null;
    to: Date | null;
  }): Promise<RevenueTotals> {
    const params: unknown[] = [];

    const courseConditions: string[] = [
      `status = 'paid'`,
      `"paidAt" IS NOT NULL`,
    ];

    const packageConditions: string[] = [
      `store_order.status = 'completed'`,
      `payment."paidAt" IS NOT NULL`,
    ];

    if (period.from) {
      params.push(period.from);

      courseConditions.push(`"paidAt" >= $${params.length}`);
    }

    if (period.to) {
      params.push(period.to);

      courseConditions.push(`"paidAt" < $${params.length}`);
    }

    if (period.from) {
      params.push(period.from);

      packageConditions.push(`payment."paidAt" >= $${params.length}`);
    }

    if (period.to) {
      params.push(period.to);

      packageConditions.push(`payment."paidAt" < $${params.length}`);
    }

    const rows = (await this.dataSource.query(
      `
        SELECT
          (
            SELECT COALESCE(
              SUM("payableAmountEur"),
              0
            )
            FROM course_purchase_orders
            WHERE ${courseConditions.join(' AND ')}
          )::text AS "courseRevenueEur",

          (
            SELECT COUNT(*)
            FROM course_purchase_orders
            WHERE ${courseConditions.join(' AND ')}
          )::int AS "courseSales",

          (
            SELECT COALESCE(
              SUM(pricing."totalAmountEur"),
              0
            )
            FROM store_orders store_order

            INNER JOIN store_order_pricing pricing
              ON pricing."orderId" = store_order.id

            INNER JOIN store_order_payments payment
              ON payment."orderId" = store_order.id

            WHERE ${packageConditions.join(' AND ')}
          )::text AS "packageRevenueEur",

          (
            SELECT COUNT(*)
            FROM store_orders store_order

            INNER JOIN store_order_payments payment
              ON payment."orderId" = store_order.id

            WHERE ${packageConditions.join(' AND ')}
          )::int AS "packageSales"
      `,
      params,
    )) as Array<{
      courseRevenueEur: string;
      packageRevenueEur: string;
      courseSales: number | string;
      packageSales: number | string;
    }>;

    const row = rows[0];

    const courseRevenueEur = Number(row?.courseRevenueEur ?? 0);

    const packageRevenueEur = Number(row?.packageRevenueEur ?? 0);

    const courseSales = Number(row?.courseSales ?? 0);

    const packageSales = Number(row?.packageSales ?? 0);

    return {
      courseRevenueEur,
      packageRevenueEur,

      totalRevenueEur: courseRevenueEur + packageRevenueEur,

      courseSales,
      packageSales,

      totalSales: courseSales + packageSales,
    };
  }

  private getTransactionCte() {
    return `
      WITH transactions AS (
        SELECT
          purchase_order.id,
          'course'::text AS source,
          purchase_order."orderNumber" AS order_number,
          purchase_order."userId" AS user_id,
          course.id AS item_id,
          course.title AS item_name,
          'course'::text AS item_type,

          purchase_order."payableAmountEur"::numeric
            AS amount_eur,

          purchase_order."paymentAmount"::numeric
            AS payment_amount,

          purchase_order."paymentCurrency"::text
            AS payment_currency,

          purchase_order."paymentProvider"::text
            AS payment_provider,

          'successful'::text AS normalized_status,
          purchase_order.status::text AS original_status,
          purchase_order."paidAt" AS transaction_at

        FROM course_purchase_orders purchase_order

        INNER JOIN courses course
          ON course.id = purchase_order."courseId"

        WHERE purchase_order.status = 'paid'
          AND purchase_order."paidAt" IS NOT NULL

        UNION ALL

        SELECT
          purchase_order.id,
          'course'::text AS source,
          purchase_order."orderNumber" AS order_number,
          purchase_order."userId" AS user_id,
          course.id AS item_id,
          course.title AS item_name,
          'course'::text AS item_type,

          purchase_order."payableAmountEur"::numeric
            AS amount_eur,

          purchase_order."paymentAmount"::numeric
            AS payment_amount,

          purchase_order."paymentCurrency"::text
            AS payment_currency,

          purchase_order."paymentProvider"::text
            AS payment_provider,

          'refunded'::text AS normalized_status,
          purchase_order.status::text AS original_status,
          purchase_order."refundedAt" AS transaction_at

        FROM course_purchase_orders purchase_order

        INNER JOIN courses course
          ON course.id = purchase_order."courseId"

        WHERE purchase_order.status = 'refunded'
          AND purchase_order."refundedAt" IS NOT NULL

        UNION ALL

        SELECT
          store_order.id,
          'package'::text AS source,
          store_order."orderNumber" AS order_number,
          store_order."userId" AS user_id,
          store_order."packageId" AS item_id,
          snapshot."packageName" AS item_name,
          snapshot."packageType"::text AS item_type,

          pricing."totalAmountEur"::numeric
            AS amount_eur,

          pricing."paymentAmount"::numeric
            AS payment_amount,

          pricing."paymentCurrency"::text
            AS payment_currency,

          payment.provider::text
            AS payment_provider,

          'successful'::text AS normalized_status,
          store_order.status::text AS original_status,
          payment."paidAt" AS transaction_at

        FROM store_orders store_order

        INNER JOIN store_order_package_snapshots snapshot
          ON snapshot."orderId" = store_order.id

        INNER JOIN store_order_pricing pricing
          ON pricing."orderId" = store_order.id

        INNER JOIN store_order_payments payment
          ON payment."orderId" = store_order.id

        WHERE store_order.status = 'completed'
          AND payment."paidAt" IS NOT NULL

        UNION ALL

        SELECT
          store_order.id,
          'package'::text AS source,
          store_order."orderNumber" AS order_number,
          store_order."userId" AS user_id,
          store_order."packageId" AS item_id,
          snapshot."packageName" AS item_name,
          snapshot."packageType"::text AS item_type,

          pricing."totalAmountEur"::numeric
            AS amount_eur,

          pricing."paymentAmount"::numeric
            AS payment_amount,

          pricing."paymentCurrency"::text
            AS payment_currency,

          payment.provider::text
            AS payment_provider,

          'refunded'::text AS normalized_status,
          store_order.status::text AS original_status,
          payment."refundedAt" AS transaction_at

        FROM store_orders store_order

        INNER JOIN store_order_package_snapshots snapshot
          ON snapshot."orderId" = store_order.id

        INNER JOIN store_order_pricing pricing
          ON pricing."orderId" = store_order.id

        INNER JOIN store_order_payments payment
          ON payment."orderId" = store_order.id

        WHERE store_order.status = 'refunded'
          AND payment."refundedAt" IS NOT NULL
      )
    `;
  }

  // =========================================================
  // Period helpers
  // =========================================================

  private resolvePeriod(query: RevenueDateRangeQueryDto): ResolvedPeriod {
    const preset = query.preset ?? RevenueDatePreset.LAST_30_DAYS;

    const now = new Date();

    let from: Date | null;
    let to: Date | null;

    if (preset === RevenueDatePreset.ALL_TIME) {
      from = null;
      to = null;
    } else if (preset === RevenueDatePreset.CUSTOM) {
      if (!query.from || !query.to) {
        throw new BadRequestException(
          'from and to are required for a custom period.',
        );
      }

      from = this.parseDateStart(query.from);
      to = this.addDays(this.parseDateStart(query.to), 1);

      if (from >= to) {
        throw new BadRequestException(
          'from must be earlier than or equal to to.',
        );
      }
    } else if (preset === RevenueDatePreset.LAST_7_DAYS) {
      from = this.addDays(this.startOfUtcDay(now), -6);

      to = now;
    } else if (preset === RevenueDatePreset.LAST_90_DAYS) {
      from = this.addDays(this.startOfUtcDay(now), -89);

      to = now;
    } else if (preset === RevenueDatePreset.THIS_MONTH) {
      from = this.startOfUtcMonth(now);
      to = now;
    } else if (preset === RevenueDatePreset.THIS_YEAR) {
      from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

      to = now;
    } else {
      from = this.addDays(this.startOfUtcDay(now), -29);

      to = now;
    }

    if (!from || !to) {
      return {
        preset,
        from,
        to,
        previousFrom: null,
        previousTo: null,
      };
    }

    const duration = to.getTime() - from.getTime();

    const previousTo = new Date(from);

    const previousFrom = new Date(previousTo.getTime() - duration);

    return {
      preset,
      from,
      to,
      previousFrom,
      previousTo,
    };
  }

  private getGrowthConfiguration(range: RevenueGraphRange) {
    const now = new Date();

    if (range === RevenueGraphRange.DAY) {
      const to = this.addHours(this.startOfUtcHour(now), 1);

      return {
        from: this.addHours(to, -24),
        to,
        step: '1 hour',
        truncateUnit: 'hour',
      };
    }

    if (range === RevenueGraphRange.MONTH) {
      const to = this.addDays(this.startOfUtcDay(now), 1);

      return {
        from: this.addDays(to, -30),
        to,
        step: '1 day',
        truncateUnit: 'day',
      };
    }

    const to = this.addDays(this.startOfUtcDay(now), 1);

    return {
      from: this.addDays(to, -7),
      to,
      step: '1 day',
      truncateUnit: 'day',
    };
  }

  private serializePeriod(period: ResolvedPeriod) {
    return {
      preset: period.preset,

      from: period.from?.toISOString() ?? null,

      to: period.to?.toISOString() ?? null,

      previousFrom: period.previousFrom?.toISOString() ?? null,

      previousTo: period.previousTo?.toISOString() ?? null,
    };
  }

  // =========================================================
  // Small helpers
  // =========================================================

  private emptyTotals(): RevenueTotals {
    return {
      courseRevenueEur: 0,
      packageRevenueEur: 0,
      totalRevenueEur: 0,
      courseSales: 0,
      packageSales: 0,
      totalSales: 0,
    };
  }

  private percentageChange(previous: number, current: number) {
    if (previous === 0) {
      return current === 0 ? 0 : 100;
    }

    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  private percentageOf(value: number, total: number) {
    if (total <= 0) {
      return 0;
    }

    return Number(((value / total) * 100).toFixed(2));
  }

  private money(value: number) {
    if (!Number.isFinite(value)) {
      return '0.00';
    }

    return value.toFixed(2);
  }

  private buildMeta(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPages,

      hasPreviousPage: page > 1,

      hasNextPage: page < totalPages,
    };
  }

  private createCsv(header: string[], rows: Array<Array<string | number>>) {
    const lines = [
      header.map((value) => this.escapeCsv(value)).join(','),

      ...rows.map((row) => row.map((value) => this.escapeCsv(value)).join(',')),
    ];

    return `\uFEFF${lines.join('\r\n')}`;
  }

  private escapeCsv(value: string | number | null) {
    const text = value === null || value === undefined ? '' : String(value);

    return `"${text.replace(/"/g, '""')}"`;
  }

  private parseDateStart(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }

    return date;
  }

  private formatGrowthLabel(date: Date, range: RevenueGraphRange) {
    if (range === RevenueGraphRange.DAY) {
      return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
    }

    if (range === RevenueGraphRange.WEEK) {
      return new Intl.DateTimeFormat('en', {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(date);
    }

    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: '2-digit',
      timeZone: 'UTC',
    }).format(date);
  }

  private startOfUtcHour(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
      ),
    );
  }

  private startOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private startOfUtcMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private addHours(date: Date, hours: number) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);

    result.setUTCDate(result.getUTCDate() + days);

    return result;
  }

  private addMonths(date: Date, months: number) {
    const result = new Date(date);

    result.setUTCMonth(result.getUTCMonth() + months);

    return result;
  }
}
