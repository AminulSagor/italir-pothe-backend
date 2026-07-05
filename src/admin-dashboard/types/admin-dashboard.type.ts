export enum DashboardRevenueRange {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum DashboardOrderSource {
  ALL = 'all',
  COURSE = 'course',
  PACKAGE = 'package',
}

export enum DashboardOrderStatus {
  ALL = 'all',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum DashboardOrderSortBy {
  ORDER_DATE = 'orderDate',
  AMOUNT = 'amount',
  STUDENT_NAME = 'studentName',
  ORDER_NUMBER = 'orderNumber',
}

export enum DashboardSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
