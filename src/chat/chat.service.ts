import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { MessageAttachment } from './entities/message-attachment.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { MessageDeliveryJob } from './entities/message-delivery-job.entity';

@Injectable()
export class ChatService {
	private readonly logger = new Logger(ChatService.name);

	constructor(
		@InjectRepository(Message)
		private readonly messageRepo: Repository<Message>,

		@InjectRepository(MessageAttachment)
		private readonly attachmentRepo: Repository<MessageAttachment>,

		@InjectRepository(Conversation)
		private readonly conversationRepo: Repository<Conversation>,

		@InjectRepository(ConversationParticipant)
		private readonly participantRepo: Repository<ConversationParticipant>,

		@InjectRepository(MessageDeliveryJob)
		private readonly deliveryJobRepo: Repository<MessageDeliveryJob>,
	) {}

	async getNextSequenceNo(conversationId: string): Promise<number> {
		const last = await this.messageRepo.findOne({
			where: { conversationId },
			order: { sequenceNo: 'DESC' },
			select: ['sequenceNo'],
		});

		return (last?.sequenceNo ?? 0) + 1;
	}

	async createMessage(data: {
		conversationId: string;
		senderId?: string | null;
		clientMessageId?: string | null;
		content?: string | null;
		messageType?: any;
		attachments?: Array<{ fileUrl: string; fileName?: string; mimeType?: string; fileSizeBytes?: string; attachmentType?: any }>;
	}) {
		if (data.clientMessageId && data.senderId) {
			const existing = await this.messageRepo.findOne({
				where: {
					senderId: data.senderId,
					clientMessageId: data.clientMessageId,
				},
			});
			if (existing) {
				this.logger.log(`Message with clientMessageId ${data.clientMessageId} already exists: ${existing.id}`);
				return existing;
			}
		}

		const sequenceNo = await this.getNextSequenceNo(data.conversationId);

		const message = this.messageRepo.create({
			conversationId: data.conversationId,
			senderId: data.senderId ?? null,
			clientMessageId: data.clientMessageId ?? null,
			sequenceNo,
			content: data.content ?? null,
			messageType: data.messageType,
		});

		const saved = await this.messageRepo.save(message);

		if (data.attachments && data.attachments.length) {
			const atts = data.attachments.map((a) =>
				this.attachmentRepo.create({
					messageId: saved.id,
					attachmentType: a.attachmentType,
					fileUrl: a.fileUrl,
					fileName: a.fileName ?? null,
					mimeType: a.mimeType ?? null,
					fileSizeBytes: a.fileSizeBytes ?? null,
				}),
			);

			await this.attachmentRepo.save(atts);
		}

		// update conversation last message
		await this.conversationRepo.update(data.conversationId, {
			lastMessageId: saved.id,
			lastMessageAt: new Date(),
		});

		return saved;
	}

	async getConversationParticipantIds(conversationId: string): Promise<string[]> {
		const participants = await this.participantRepo.find({
			where: { conversationId },
			select: ['userId'],
		});

		return participants.map((p) => p.userId);
	}

	async createDeliveryJobs(params: {
		messageId: string;
		conversationId: string;
		receiverIds: string[];
		deliveryType?: any;
	}) {
		const jobs = params.receiverIds.map((rid) =>
			this.deliveryJobRepo.create({
				messageId: params.messageId,
				conversationId: params.conversationId,
				receiverId: rid,
				deliveryType: params.deliveryType,
				status: undefined,
			}),
		);

		return this.deliveryJobRepo.save(jobs);
	}
}
