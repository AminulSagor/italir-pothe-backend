import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  DashboardOrdersExportQueryDto,
  DashboardOrdersFilterDto,
  DashboardOrdersQueryDto,
  DashboardRevenueGrowthQueryDto,
} from './dto/admin-dashboard.dto';
import {
  DashboardOrderSortBy,
  DashboardOrderSource,
  DashboardOrderStatus,
  DashboardRevenueRange,
  DashboardSortOrder,
} from './types/admin-dashboard.type';

interface DashboardGrowthConfiguration {
  range: DashboardRevenueRange;
  from: Date;
  to: Date;
  step: '1 hour' | '1 day' | '1 month';
  truncateUnit: 'hour' | 'day' | 'month';
}

interface ResolvedOrderDateRange {
  from: Date | null;
  to: Date | null;
}

interface NormalizedOrderFilters {
  search: string | null;
  status: DashboardOrderStatus;
  source: DashboardOrderSource;
  sortBy: DashboardOrderSortBy;
  sortOrder: DashboardSortOrder;
  dateRange: ResolvedOrderDateRange;
}

interface RawDashboardOrderRow {
  id: string;
  source: DashboardOrderSource;
  orderNumber: string;

  userId: string;
  studentName: string;
  studentEmail: string | null;
  studentAvatarUrl: string | null;
  studentDeleted: boolean;

  itemId: string;
  itemName: string;
  itemType: string;

  amountEur: string;
  chargedAmount: string | null;
  chargedCurrency: string | null;
  paymentProvider: string | null;

  status: DashboardOrderStatus;
  originalStatus: string;

  orderDate: Date | string;
  createdAt: Date | string;
  paidAt: Date | string | null;
  refundedAt: Date | string | null;
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getOverview() {
    const now = new Date();

    const currentMonthStart = this.startOfUtcMonth(now);

    const previousMonthStart = this.addMonths(currentMonthStart, -1);

    const elapsedCurrentMonthMs = now.getTime() - currentMonthStart.getTime();

    const previousComparableEnd = new Date(
      Math.min(
        currentMonthStart.getTime(),

        previousMonthStart.getTime() + elapsedCurrentMonthMs,
      ),
    );

    const [
      currentMonthRevenue,
      previousMonthComparableRevenue,
      studentRows,
      courseRows,
    ] = await Promise.all([
      this.getSuccessfulRevenue(currentMonthStart, now),

      this.getSuccessfulRevenue(previousMonthStart, previousComparableEnd),

      this.dataSource.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE role = 'user'
            )::int AS "totalStudents",

            COUNT(*) FILTER (
              WHERE role = 'user'
                AND "createdAt" < $1
            )::int AS "studentsAtMonthStart",

            COUNT(*) FILTER (
              WHERE role = 'user'
                AND "createdAt" >= $1
                AND "createdAt" < $2
            )::int AS "newStudentsCurrentPeriod",

            COUNT(*) FILTER (
              WHERE role = 'user'
                AND "createdAt" >= $3
                AND "createdAt" < $4
            )::int AS "newStudentsPreviousPeriod"

          FROM users
        `,
        [currentMonthStart, now, previousMonthStart, previousComparableEnd],
      ),

      this.dataSource.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE status = 'published'
            )::int AS "activeCourses",

            COUNT(*) FILTER (
              WHERE status = 'published'
                AND COALESCE(
                  "publishedAt",
                  "createdAt"
                ) < $1
            )::int AS "activeCoursesAtMonthStart"

          FROM courses
        `,
        [currentMonthStart],
      ),
    ]);

    const studentStats = (
      studentRows as Array<{
        totalStudents: number | string;

        studentsAtMonthStart: number | string;

        newStudentsCurrentPeriod: number | string;

        newStudentsPreviousPeriod: number | string;
      }>
    )[0];

    const courseStats = (
      courseRows as Array<{
        activeCourses: number | string;

        activeCoursesAtMonthStart: number | string;
      }>
    )[0];

    const totalStudents = Number(studentStats?.totalStudents ?? 0);

    const studentsAtMonthStart = Number(
      studentStats?.studentsAtMonthStart ?? 0,
    );

    const newStudentsCurrentPeriod = Number(
      studentStats?.newStudentsCurrentPeriod ?? 0,
    );

    const newStudentsPreviousPeriod = Number(
      studentStats?.newStudentsPreviousPeriod ?? 0,
    );

    const activeCourses = Number(courseStats?.activeCourses ?? 0);

    const activeCoursesAtMonthStart = Number(
      courseStats?.activeCoursesAtMonthStart ?? 0,
    );

    return {
      system: {
        status: 'online' as const,
        database: 'connected' as const,
        checkedAt: now.toISOString(),
      },

      currency: 'EUR' as const,

      cards: {
        monthlyRevenue: {
          amount: this.money(currentMonthRevenue),

          changePercentage: this.percentageChange(
            previousMonthComparableRevenue,
            currentMonthRevenue,
          ),

          periodStart: currentMonthStart.toISOString(),

          periodEnd: now.toISOString(),

          comparisonStart: previousMonthStart.toISOString(),

          comparisonEnd: previousComparableEnd.toISOString(),
        },

        totalStudents: {
          value: totalStudents,

          changePercentage: this.percentageChange(
            studentsAtMonthStart,
            totalStudents,
          ),

          newThisMonth: newStudentsCurrentPeriod,
        },

        activeCourses: {
          value: activeCourses,

          changePercentage: this.percentageChange(
            activeCoursesAtMonthStart,
            activeCourses,
          ),

          publishedThisMonth: Math.max(
            0,

            activeCourses - activeCoursesAtMonthStart,
          ),
        },

        newStudentSignups: {
          value: newStudentsCurrentPeriod,

          changePercentage: this.percentageChange(
            newStudentsPreviousPeriod,
            newStudentsCurrentPeriod,
          ),

          comparisonValue: newStudentsPreviousPeriod,

          periodStart: currentMonthStart.toISOString(),

          periodEnd: now.toISOString(),

          comparisonStart: previousMonthStart.toISOString(),

          comparisonEnd: previousComparableEnd.toISOString(),
        },
      },

      generatedAt: now.toISOString(),

      timezone: 'UTC' as const,
    };
  }

  async getRevenueGrowth(query: DashboardRevenueGrowthQueryDto) {
    const range = query.range ?? DashboardRevenueRange.MONTHLY;

    const configuration = this.getGrowthConfiguration(range);

    const rows = (await this.dataSource.query(
      `
            WITH buckets AS (
              SELECT generate_series(
                $1::timestamptz,
                $2::timestamptz -
                  INTERVAL '${configuration.step}',
                INTERVAL '${configuration.step}'
              ) AS bucket_start
            ),

            successful_orders AS (
              SELECT
                'course'::text AS source,

                purchase_order."paidAt"
                  AS order_date,

                purchase_order."payableAmountEur"::numeric
                  AS amount_eur

              FROM course_purchase_orders
                purchase_order

              WHERE purchase_order.status = 'paid'
                AND purchase_order."paidAt" IS NOT NULL
                AND purchase_order."paidAt" >= $1
                AND purchase_order."paidAt" < $2

              UNION ALL

              SELECT
                'package'::text AS source,

                payment."paidAt"
                  AS order_date,

                pricing."totalAmountEur"::numeric
                  AS amount_eur

              FROM store_orders
                store_order

              INNER JOIN store_order_pricing
                pricing
                ON pricing."orderId" =
                   store_order.id

              INNER JOIN store_order_payments
                payment
                ON payment."orderId" =
                   store_order.id

              WHERE store_order.status = 'completed'
                AND payment."paidAt" IS NOT NULL
                AND payment."paidAt" >= $1
                AND payment."paidAt" < $2
            )

            SELECT
              bucket.bucket_start
                AS "bucketStart",

              COALESCE(
                SUM(
                  successful_order.amount_eur
                ) FILTER (
                  WHERE successful_order.source =
                    'course'
                ),
                0
              )::text AS "courseRevenueEur",

              COALESCE(
                SUM(
                  successful_order.amount_eur
                ) FILTER (
                  WHERE successful_order.source =
                    'package'
                ),
                0
              )::text AS "packageRevenueEur",

              COALESCE(
                SUM(
                  successful_order.amount_eur
                ),
                0
              )::text AS "totalRevenueEur",

              COUNT(
                successful_order.order_date
              )::int AS "purchaseCount"

            FROM buckets bucket

            LEFT JOIN successful_orders
              successful_order

              ON DATE_TRUNC(
                '${configuration.truncateUnit}',

                successful_order.order_date
                  AT TIME ZONE 'UTC'
              ) = DATE_TRUNC(
                '${configuration.truncateUnit}',

                bucket.bucket_start
                  AT TIME ZONE 'UTC'
              )

            GROUP BY
              bucket.bucket_start

            ORDER BY
              bucket.bucket_start ASC
          `,
      [configuration.from, configuration.to],
    )) as Array<{
      bucketStart: Date | string;

      courseRevenueEur: string;

      packageRevenueEur: string;

      totalRevenueEur: string;

      purchaseCount: number | string;
    }>;

    let cumulativeRevenue = 0;

    const points = rows.map((row) => {
      const bucketStart = new Date(row.bucketStart);

      const totalRevenue = Number(row.totalRevenueEur) || 0;

      cumulativeRevenue += totalRevenue;

      return {
        bucketStart: bucketStart.toISOString(),

        label: this.formatGrowthLabel(bucketStart, range),

        courseRevenueEur: this.money(Number(row.courseRevenueEur) || 0),

        packageRevenueEur: this.money(Number(row.packageRevenueEur) || 0),

        totalRevenueEur: this.money(totalRevenue),

        cumulativeRevenueEur: this.money(cumulativeRevenue),

        purchaseCount: Number(row.purchaseCount) || 0,
      };
    });

    const firstPointRevenue = Number(points[0]?.totalRevenueEur ?? 0);

    const lastPointRevenue = Number(
      points[points.length - 1]?.totalRevenueEur ?? 0,
    );

    return {
      range,
      currency: 'EUR' as const,

      bucketUnit: configuration.truncateUnit,

      from: configuration.from.toISOString(),

      to: configuration.to.toISOString(),

      points,

      totals: {
        revenueEur: this.money(
          points.reduce(
            (total, point) => total + Number(point.totalRevenueEur),

            0,
          ),
        ),

        purchases: points.reduce(
          (total, point) => total + point.purchaseCount,

          0,
        ),

        firstBucketRevenueEur: this.money(firstPointRevenue),

        lastBucketRevenueEur: this.money(lastPointRevenue),

        changePercentage: this.percentageChange(
          firstPointRevenue,
          lastPointRevenue,
        ),
      },

      timezone: 'UTC' as const,
    };
  }

  async getRecentPurchases() {
    const items = await this.queryOrderRows(
      {
        search: null,

        status: DashboardOrderStatus.COMPLETED,

        source: DashboardOrderSource.ALL,

        sortBy: DashboardOrderSortBy.ORDER_DATE,

        sortOrder: DashboardSortOrder.DESC,

        dateRange: {
          from: null,
          to: null,
        },
      },

      {
        limit: 5,
        offset: 0,
      },
    );

    return {
      items,
      limit: 5,
      returned: items.length,

      generatedAt: new Date().toISOString(),
    };
  }

  async getOrders(query: DashboardOrdersQueryDto) {
    const page = query.page ?? 1;

    const limit = query.limit ?? 20;

    const filters = this.normalizeOrderFilters(query);

    const [total, items] = await Promise.all([
      this.countOrderRows(filters),

      this.queryOrderRows(filters, {
        limit,

        offset: (page - 1) * limit,
      }),
    ]);

    return {
      items,

      meta: this.buildMeta(page, limit, total),

      appliedFilters: {
        search: filters.search,

        status: filters.status,

        source: filters.source,

        sortBy: filters.sortBy,

        sortOrder: filters.sortOrder,

        from: filters.dateRange.from?.toISOString() ?? null,

        to: filters.dateRange.to?.toISOString() ?? null,
      },
    };
  }

  async exportOrdersCsv(query: DashboardOrdersExportQueryDto) {
    const filters = this.normalizeOrderFilters(query);

    const items = await this.queryOrderRows(filters, null);

    const rows: Array<Array<string | number | null>> = items.map((item) => [
      item.orderNumber,
      item.source,

      item.student.name,
      item.student.email,

      item.student.deleted ? 'Yes' : 'No',

      item.item.name,
      item.item.type,

      item.normalizedAmount.amount,
      item.normalizedAmount.currency,

      item.chargedAmount?.amount ?? null,

      item.chargedAmount?.currency ?? null,

      item.paymentProvider,

      item.status,
      item.originalStatus,
      item.orderDate,
    ]);

    return this.createCsv(
      [
        'Order ID',
        'Source',
        'Student Name',
        'Student Email',
        'Deleted Student',
        'Item Purchased',
        'Item Type',
        'Amount',
        'Normalized Currency',
        'Charged Amount',
        'Charged Currency',
        'Payment Provider',
        'Status',
        'Original Status',
        'Order Date',
      ],
      rows,
    );
  }

  private async getSuccessfulRevenue(from: Date, to: Date): Promise<number> {
    const rows = (await this.dataSource.query(
      `
            SELECT
              (
                SELECT COALESCE(
                  SUM(
                    purchase_order."payableAmountEur"
                  ),
                  0
                )

                FROM course_purchase_orders
                  purchase_order

                WHERE purchase_order.status = 'paid'
                  AND purchase_order."paidAt"
                    IS NOT NULL
                  AND purchase_order."paidAt" >= $1
                  AND purchase_order."paidAt" < $2
              )
              +
              (
                SELECT COALESCE(
                  SUM(
                    pricing."totalAmountEur"
                  ),
                  0
                )

                FROM store_orders
                  store_order

                INNER JOIN store_order_pricing
                  pricing

                  ON pricing."orderId" =
                     store_order.id

                INNER JOIN store_order_payments
                  payment

                  ON payment."orderId" =
                     store_order.id

                WHERE store_order.status =
                      'completed'

                  AND payment."paidAt"
                      IS NOT NULL

                  AND payment."paidAt" >= $1
                  AND payment."paidAt" < $2
              ) AS total_revenue
          `,
      [from, to],
    )) as Array<{
      total_revenue: string | number | null;
    }>;

    return Number(rows[0]?.total_revenue ?? 0);
  }

  private normalizeOrderFilters(
    query: DashboardOrdersFilterDto,
  ): NormalizedOrderFilters {
    return {
      search: query.search?.trim() || null,

      status: query.status ?? DashboardOrderStatus.ALL,

      source: query.source ?? DashboardOrderSource.ALL,

      sortBy: query.sortBy ?? DashboardOrderSortBy.ORDER_DATE,

      sortOrder: query.sortOrder ?? DashboardSortOrder.DESC,

      dateRange: this.resolveOrderDateRange(query.from, query.to),
    };
  }

  private async countOrderRows(
    filters: NormalizedOrderFilters,
  ): Promise<number> {
    const filterSql = this.buildOrderFilterSql(filters);

    const rows = (await this.dataSource.query(
      `
            ${this.getUnifiedOrdersCte()}

            SELECT
              COUNT(*)::int AS total

            FROM unified_orders
              dashboard_order

            LEFT JOIN users
              live_user

              ON live_user.id =
                 dashboard_order.user_id

            LEFT JOIN deleted_user_audits
              deleted_user

              ON deleted_user."originalUserId" =
                 dashboard_order.user_id

            ${filterSql.whereSql}
          `,
      filterSql.params,
    )) as Array<{
      total: number | string;
    }>;

    return Number(rows[0]?.total ?? 0);
  }

  private async queryOrderRows(
    filters: NormalizedOrderFilters,

    pagination: {
      limit: number;
      offset: number;
    } | null,
  ) {
    const filterSql = this.buildOrderFilterSql(filters);

    const params = [...filterSql.params];

    let paginationSql = '';

    if (pagination) {
      params.push(pagination.limit);

      const limitParameter = params.length;

      params.push(pagination.offset);

      const offsetParameter = params.length;

      paginationSql = `
        LIMIT $${limitParameter}
        OFFSET $${offsetParameter}
      `;
    }

    const sortMap: Record<DashboardOrderSortBy, string> = {
      [DashboardOrderSortBy.ORDER_DATE]: 'dashboard_order.order_date',

      [DashboardOrderSortBy.AMOUNT]: 'dashboard_order.amount_eur',

      [DashboardOrderSortBy.STUDENT_NAME]: `COALESCE(
          live_user."fullName",
          deleted_user."displayName",
          'Deleted User'
        )`,

      [DashboardOrderSortBy.ORDER_NUMBER]: 'dashboard_order.order_number',
    };

    const rows = (await this.dataSource.query(
      `
            ${this.getUnifiedOrdersCte()}

            SELECT
              dashboard_order.id,
              dashboard_order.source,

              dashboard_order.order_number
                AS "orderNumber",

              dashboard_order.user_id
                AS "userId",

              COALESCE(
                live_user."fullName",
                deleted_user."displayName",
                'Deleted User'
              ) AS "studentName",

              live_user.email
                AS "studentEmail",

              live_user."avatarUrl"
                AS "studentAvatarUrl",

              (
                live_user.id IS NULL
              ) AS "studentDeleted",

              dashboard_order.item_id
                AS "itemId",

              dashboard_order.item_name
                AS "itemName",

              dashboard_order.item_type
                AS "itemType",

              dashboard_order.amount_eur::text
                AS "amountEur",

              dashboard_order.charged_amount::text
                AS "chargedAmount",

              dashboard_order.charged_currency
                AS "chargedCurrency",

              dashboard_order.payment_provider
                AS "paymentProvider",

              dashboard_order.normalized_status
                AS status,

              dashboard_order.original_status
                AS "originalStatus",

              dashboard_order.order_date
                AS "orderDate",

              dashboard_order.created_at
                AS "createdAt",

              dashboard_order.paid_at
                AS "paidAt",

              dashboard_order.refunded_at
                AS "refundedAt"

            FROM unified_orders
              dashboard_order

            LEFT JOIN users
              live_user

              ON live_user.id =
                 dashboard_order.user_id

            LEFT JOIN deleted_user_audits
              deleted_user

              ON deleted_user."originalUserId" =
                 dashboard_order.user_id

            ${filterSql.whereSql}

            ORDER BY
              ${sortMap[filters.sortBy]}
              ${filters.sortOrder},

              dashboard_order.id ASC

            ${paginationSql}
          `,
      params,
    )) as RawDashboardOrderRow[];

    return rows.map((row) => ({
      id: row.id,

      source: row.source,

      orderNumber: row.orderNumber,

      student: {
        id: row.userId,

        name: row.studentName,

        email: row.studentEmail,

        avatarUrl: row.studentAvatarUrl,

        deleted: Boolean(row.studentDeleted),
      },

      item: {
        id: row.itemId,

        name: row.itemName,

        type: row.itemType,
      },

      normalizedAmount: {
        amount: this.money(Number(row.amountEur) || 0),

        currency: 'EUR' as const,
      },

      chargedAmount:
        row.chargedAmount !== null && row.chargedCurrency !== null
          ? {
              amount: this.money(Number(row.chargedAmount) || 0),

              currency: row.chargedCurrency,
            }
          : null,

      paymentProvider: row.paymentProvider,

      status: row.status,

      originalStatus: row.originalStatus,

      orderDate: new Date(row.orderDate).toISOString(),

      createdAt: new Date(row.createdAt).toISOString(),

      paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,

      refundedAt: row.refundedAt
        ? new Date(row.refundedAt).toISOString()
        : null,
    }));
  }

  private buildOrderFilterSql(filters: NormalizedOrderFilters) {
    const params: unknown[] = [];

    const conditions: string[] = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);

      const parameter = params.length;

      conditions.push(`
        (
          COALESCE(
            live_user."fullName",
            deleted_user."displayName",
            'Deleted User'
          ) ILIKE $${parameter}

          OR COALESCE(
            live_user.email,
            ''
          ) ILIKE $${parameter}

          OR dashboard_order.order_number
             ILIKE $${parameter}

          OR dashboard_order.item_name
             ILIKE $${parameter}
        )
      `);
    }

    if (filters.status !== DashboardOrderStatus.ALL) {
      params.push(filters.status);

      conditions.push(
        `dashboard_order.normalized_status =
         $${params.length}`,
      );
    }

    if (filters.source !== DashboardOrderSource.ALL) {
      params.push(filters.source);

      conditions.push(
        `dashboard_order.source =
         $${params.length}`,
      );
    }

    if (filters.dateRange.from) {
      params.push(filters.dateRange.from);

      conditions.push(
        `dashboard_order.order_date >=
         $${params.length}`,
      );
    }

    if (filters.dateRange.to) {
      params.push(filters.dateRange.to);

      conditions.push(
        `dashboard_order.order_date <
         $${params.length}`,
      );
    }

    return {
      params,

      whereSql:
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    };
  }

  private getUnifiedOrdersCte() {
    return `
      WITH unified_orders AS (
        SELECT
          purchase_order.id,

          'course'::text
            AS source,

          purchase_order."orderNumber"
            AS order_number,

          purchase_order."userId"
            AS user_id,

          purchase_order."courseId"
            AS item_id,

          COALESCE(
            course.title,
            'Deleted Course'
          ) AS item_name,

          'course'::text
            AS item_type,

          purchase_order."payableAmountEur"::numeric
            AS amount_eur,

          purchase_order."paymentAmount"::numeric
            AS charged_amount,

          purchase_order."paymentCurrency"::text
            AS charged_currency,

          purchase_order."paymentProvider"::text
            AS payment_provider,

          CASE
            purchase_order.status::text

            WHEN 'paid'
              THEN 'completed'

            WHEN 'pending'
              THEN 'pending'

            WHEN 'processing'
              THEN 'processing'

            WHEN 'failed'
              THEN 'failed'

            WHEN 'cancelled'
              THEN 'cancelled'

            WHEN 'refunded'
              THEN 'refunded'

            ELSE
              purchase_order.status::text
          END AS normalized_status,

          purchase_order.status::text
            AS original_status,

          CASE
            WHEN
              purchase_order.status =
                'refunded'

              AND purchase_order."refundedAt"
                  IS NOT NULL

              THEN
                purchase_order."refundedAt"

            WHEN
              purchase_order.status =
                'paid'

              AND purchase_order."paidAt"
                  IS NOT NULL

              THEN
                purchase_order."paidAt"

            ELSE
              COALESCE(
                purchase_order."updatedAt",
                purchase_order."createdAt"
              )
          END AS order_date,

          purchase_order."createdAt"
            AS created_at,

          purchase_order."paidAt"
            AS paid_at,

          purchase_order."refundedAt"
            AS refunded_at

        FROM course_purchase_orders
          purchase_order

        LEFT JOIN courses course
          ON course.id =
             purchase_order."courseId"

        UNION ALL

        SELECT
          store_order.id,

          'package'::text
            AS source,

          store_order."orderNumber"
            AS order_number,

          store_order."userId"
            AS user_id,

          store_order."packageId"
            AS item_id,

          COALESCE(
            snapshot."packageName",
            store_package.name,
            'Deleted Package'
          ) AS item_name,

          COALESCE(
            snapshot."packageType"::text,
            store_package."packageType"::text,
            'package'
          ) AS item_type,

          COALESCE(
            pricing."totalAmountEur",
            0
          )::numeric AS amount_eur,

          pricing."paymentAmount"::numeric
            AS charged_amount,

          pricing."paymentCurrency"::text
            AS charged_currency,

          payment.provider::text
            AS payment_provider,

          CASE
            store_order.status::text

            WHEN 'completed'
              THEN 'completed'

            WHEN 'pending'
              THEN 'pending'

            WHEN 'failed'
              THEN 'failed'

            WHEN 'refunded'
              THEN 'refunded'

            ELSE
              store_order.status::text
          END AS normalized_status,

          store_order.status::text
            AS original_status,

          CASE
            WHEN
              store_order.status =
                'refunded'

              AND payment."refundedAt"
                  IS NOT NULL

              THEN
                payment."refundedAt"

            WHEN
              store_order.status =
                'completed'

              AND payment."paidAt"
                  IS NOT NULL

              THEN
                payment."paidAt"

            ELSE
              COALESCE(
                store_order."updatedAt",
                store_order."createdAt"
              )
          END AS order_date,

          store_order."createdAt"
            AS created_at,

          payment."paidAt"
            AS paid_at,

          payment."refundedAt"
            AS refunded_at

        FROM store_orders
          store_order

        LEFT JOIN store_order_package_snapshots
          snapshot

          ON snapshot."orderId" =
             store_order.id

        LEFT JOIN store_order_pricing
          pricing

          ON pricing."orderId" =
             store_order.id

        LEFT JOIN store_order_payments
          payment

          ON payment."orderId" =
             store_order.id

        LEFT JOIN store_packages
          store_package

          ON store_package.id =
             store_order."packageId"
      )
    `;
  }

  private resolveOrderDateRange(
    fromValue?: string,
    toValue?: string,
  ): ResolvedOrderDateRange {
    const from = fromValue ? this.parseDateBoundary(fromValue, false) : null;

    const to = toValue ? this.parseDateBoundary(toValue, true) : null;

    if (from && to && from >= to) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }

    return {
      from,
      to,
    };
  }

  private parseDateBoundary(value: string, endExclusive: boolean): Date {
    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

    const date = dateOnlyPattern.test(value)
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }

    return endExclusive && dateOnlyPattern.test(value)
      ? this.addDays(date, 1)
      : date;
  }

  private getGrowthConfiguration(
    range: DashboardRevenueRange,
  ): DashboardGrowthConfiguration {
    const now = new Date();

    if (range === DashboardRevenueRange.DAILY) {
      const to = this.addHours(this.startOfUtcHour(now), 1);

      return {
        range,

        from: this.addHours(to, -24),

        to,
        step: '1 hour',
        truncateUnit: 'hour',
      };
    }

    if (range === DashboardRevenueRange.WEEKLY) {
      const to = this.addDays(this.startOfUtcDay(now), 1);

      return {
        range,

        from: this.addDays(to, -7),

        to,
        step: '1 day',
        truncateUnit: 'day',
      };
    }

    const to = this.addMonths(this.startOfUtcMonth(now), 1);

    return {
      range,

      from: this.addMonths(to, -6),

      to,
      step: '1 month',
      truncateUnit: 'month',
    };
  }

  private formatGrowthLabel(date: Date, range: DashboardRevenueRange): string {
    if (range === DashboardRevenueRange.DAILY) {
      return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
    }

    if (range === DashboardRevenueRange.WEEKLY) {
      return new Intl.DateTimeFormat('en', {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(date);
    }

    return new Intl.DateTimeFormat('en', {
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
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

      from: total === 0 ? 0 : (page - 1) * limit + 1,

      to: Math.min(page * limit, total),
    };
  }

  private percentageChange(previous: number, current: number): number {
    if (previous === 0) {
      return current === 0 ? 0 : 100;
    }

    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  private money(value: number): string {
    if (!Number.isFinite(value)) {
      return '0.00';
    }

    return value.toFixed(2);
  }

  private createCsv(
    header: string[],

    rows: Array<Array<string | number | null>>,
  ): string {
    const lines = [
      header.map((value) => this.escapeCsv(value)).join(','),

      ...rows.map((row) => row.map((value) => this.escapeCsv(value)).join(',')),
    ];

    return `\uFEFF${lines.join('\r\n')}`;
  }

  private escapeCsv(value: string | number | null): string {
    const text = value === null || value === undefined ? '' : String(value);

    return `"${text.replace(/"/g, '""')}"`;
  }

  private startOfUtcHour(date: Date): Date {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
      ),
    );
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private startOfUtcMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);

    result.setUTCDate(result.getUTCDate() + days);

    return result;
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);

    result.setUTCMonth(result.getUTCMonth() + months);

    return result;
  }
}
