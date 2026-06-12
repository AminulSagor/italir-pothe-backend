import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull } from 'typeorm';
import { MessageDeliveryJob } from './entities/message-delivery-job.entity';
import { DeliveryJobStatus, DeliveryType } from './enums/chat.enums';
import { ChatGateway } from './chat.gateway';
import { MessageReceipt } from './entities/message-receipt.entity';

@Injectable()
export class MessageDeliveryProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageDeliveryProcessor.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(MessageDeliveryJob)
    private readonly jobRepo: Repository<MessageDeliveryJob>,

    @InjectRepository(MessageReceipt)
    private readonly receiptRepo: Repository<MessageReceipt>,

    private readonly gateway: ChatGateway,
  ) {}

  onModuleInit() {
    this.interval = setInterval(() => this.processJobs().catch((err) => this.logger.error(err)), 2000);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private async processJobs() {
    const now = new Date();

    const jobs = await this.jobRepo.find({
      where: [
        { status: DeliveryJobStatus.PENDING, nextRetryAt: IsNull() },
        { status: DeliveryJobStatus.PENDING, nextRetryAt: LessThanOrEqual(now) },
      ],
      order: { createdAt: 'ASC' },
      take: 50,
    });

    if (!jobs.length) return;

    for (const job of jobs) {
      try {
        job.status = DeliveryJobStatus.PROCESSING;
        await this.jobRepo.save(job);

        if (job.deliveryType === DeliveryType.SOCKET) {
          const sent = this.gateway.sendToUser(job.receiverId, 'message_delivery', { messageId: job.messageId, conversationId: job.conversationId });

          if (sent) {
            job.status = DeliveryJobStatus.COMPLETED;
            await this.jobRepo.save(job);

            // create or update receipt
            const receipt = this.receiptRepo.create({
              messageId: job.messageId,
              userId: job.receiverId,
              deliveredAt: new Date(),
            });
            await this.receiptRepo.save(receipt);
          } else {
            // not online, schedule retry
            job.retryCount = (job.retryCount ?? 0) + 1;
            job.nextRetryAt = new Date(Date.now() + Math.min(60 * 60 * 1000, 1000 * Math.pow(2, job.retryCount)));
            job.status = job.retryCount > 5 ? DeliveryJobStatus.FAILED : DeliveryJobStatus.PENDING;
            await this.jobRepo.save(job);
          }
        } else {
          // Placeholder for PUSH delivery
          job.status = DeliveryJobStatus.FAILED;
          await this.jobRepo.save(job);
        }
      } catch (err) {
        this.logger.error('Error processing job', err as any);
        job.status = DeliveryJobStatus.FAILED;
        await this.jobRepo.save(job);
      }
    }
  }
}
