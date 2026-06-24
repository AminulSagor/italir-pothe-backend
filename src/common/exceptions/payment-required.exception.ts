import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentRequiredException extends HttpException {
  constructor(message = 'Payment is required.') {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message,
        error: 'Payment Required',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
