import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvento } from './entities/outbox-evento.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvento])],
  exports: [TypeOrmModule],
})
export class OutboxModule {}
