-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TicketCategory" ADD VALUE 'MANUTENCAO_INDUSTRIAL';
ALTER TYPE "TicketCategory" ADD VALUE 'DIRETORIA';
ALTER TYPE "TicketCategory" ADD VALUE 'EXPEDICAO';
ALTER TYPE "TicketCategory" ADD VALUE 'ENGENHARIA_DE_MINAS';
ALTER TYPE "TicketCategory" ADD VALUE 'RECEPCAO';
ALTER TYPE "TicketCategory" ADD VALUE 'PORTARIA';
ALTER TYPE "TicketCategory" ADD VALUE 'RECURSOS_HUMANOS';
ALTER TYPE "TicketCategory" ADD VALUE 'COMERCIAL';
ALTER TYPE "TicketCategory" ADD VALUE 'SELECAO_E_RECRUTAMENTO';
ALTER TYPE "TicketCategory" ADD VALUE 'MANUTENCAO_DE_AUTO';
