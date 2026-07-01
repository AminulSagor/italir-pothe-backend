export enum RevenueDatePreset {
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  THIS_MONTH = 'this_month',
  THIS_YEAR = 'this_year',
  ALL_TIME = 'all_time',
  CUSTOM = 'custom',
}

export enum RevenueGraphRange {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export enum RevenueSource {
  ALL = 'all',
  COURSE = 'course',
  PACKAGE = 'package',
}

export enum RevenueTransactionStatus {
  ALL = 'all',
  SUCCESSFUL = 'successful',
  REFUNDED = 'refunded',
}

export enum RevenueSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum RevenueTransactionSortBy {
  TRANSACTION_AT = 'transactionAt',
  AMOUNT = 'amount',
  ORDER_NUMBER = 'orderNumber',
  USER_NAME = 'userName',
  ITEM_NAME = 'itemName',
}

export enum CoursePerformanceSortBy {
  COURSE_NAME = 'courseName',
  ENROLLMENTS = 'enrollments',
  SALES = 'sales',
  REVENUE = 'revenue',
  LAST_SALE = 'lastSaleAt',
}

export enum PackagePerformanceSortBy {
  PACKAGE_NAME = 'packageName',
  PACKAGE_TYPE = 'packageType',
  SALES = 'sales',
  REVENUE = 'revenue',
  LAST_SALE = 'lastSaleAt',
}
