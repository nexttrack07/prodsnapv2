import { invariant } from '../invariant'
import { forwardRef, useState } from 'react'
import { Box, Paper, Text, ActionIcon } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'

import { CONTENT_TYPES } from '../types'
import { useDeleteCardMutation, useUpdateCardMutation } from '../queries'
import { deleteItemSchema } from '../db/schema'

interface CardProps {
  title: string
  content: string | null
  id: string
  columnId: string
  boardId: string
  order: number
  nextOrder: number
  previousOrder: number
}

export const Card = forwardRef<HTMLLIElement, CardProps>(
  (
    { title, content, id, columnId, boardId, order, nextOrder, previousOrder },
    ref,
  ) => {
    const [acceptDrop, setAcceptDrop] = useState<'none' | 'top' | 'bottom'>(
      'none',
    )

    const deleteCard = useDeleteCardMutation()
    const moveCard = useUpdateCardMutation()

    return (
      <Box
        component="li"
        ref={ref}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(CONTENT_TYPES.card)) {
            event.preventDefault()
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            const midpoint = (rect.top + rect.bottom) / 2
            setAcceptDrop(event.clientY <= midpoint ? 'top' : 'bottom')
          }
        }}
        onDragLeave={() => {
          setAcceptDrop('none')
        }}
        onDrop={(event) => {
          event.stopPropagation()

          const transfer = JSON.parse(
            event.dataTransfer.getData(CONTENT_TYPES.card) || 'null',
          )

          if (!transfer) {
            return
          }

          invariant(transfer.id, 'missing cardId')
          invariant(transfer.title, 'missing title')

          const droppedOrder = acceptDrop === 'top' ? previousOrder : nextOrder
          const moveOrder = (droppedOrder + order) / 2

          moveCard.mutate({
            order: moveOrder,
            columnId,
            boardId,
            id: transfer.id,
            title: transfer.title,
          })

          setAcceptDrop('none')
        }}
        style={{
          borderTop: `2px solid ${acceptDrop === 'top' ? 'var(--mantine-color-red-5)' : 'transparent'}`,
          borderBottom: `2px solid ${acceptDrop === 'bottom' ? 'var(--mantine-color-red-5)' : 'transparent'}`,
          marginBottom: -2,
          cursor: 'grab',
          padding: '4px 8px',
        }}
        mod={{ 'last-child': { marginBottom: 0 } }}
      >
        <Paper
          draggable
          shadow="xs"
          p="xs"
          radius="md"
          pos="relative"
          style={{
            border: '1px solid var(--mantine-color-gray-3)',
          }}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData(
              CONTENT_TYPES.card,
              JSON.stringify({ id, title }),
            )
            event.stopPropagation()
          }}
        >
          <Text size="sm" fw={500}>{title}</Text>
          <Text size="sm" mt="xs">{content || '\u00A0'}</Text>
          <form
            onSubmit={(event) => {
              event.preventDefault()

              deleteCard.mutate(
                deleteItemSchema.parse({
                  id,
                  boardId,
                }),
              )
            }}
          >
            <ActionIcon
              type="submit"
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Delete card"
              pos="absolute"
              top={16}
              right={16}
              style={{
                '&:hover': { color: 'var(--mantine-color-red-5)' },
              }}
            >
              <Text size="xs" c="dimmed" mr={4}>{order}</Text>
              <IconTrash size={14} />
            </ActionIcon>
          </form>
        </Paper>
      </Box>
    )
  },
)
