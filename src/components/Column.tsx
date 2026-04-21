import { forwardRef, useCallback, useMemo, useRef, useState } from 'react'
import { Box, Paper, ScrollArea, Group, UnstyledButton, ActionIcon, Text } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'

import { flushSync } from 'react-dom'
import { invariant } from '../invariant'
import { CONTENT_TYPES } from '../types'
import {
  useDeleteColumnMutation,
  useUpdateCardMutation,
  useUpdateColumnMutation,
} from '../queries'
import { EditableText } from './EditableText'
import { NewCard } from './NewCard'
import { Card } from './Card'
import type { RenderedItem } from '../types'

interface ColumnProps {
  name: string
  boardId: string
  columnId: string
  items: Array<RenderedItem>
  nextOrder: number
  previousOrder: number
  order: number
}

export const Column = forwardRef<HTMLDivElement, ColumnProps>(
  (
    { name, columnId, boardId, items, nextOrder, previousOrder, order },
    ref,
  ) => {
    const [acceptCardDrop, setAcceptCardDrop] = useState(false)
    const editState = useState(false)

    const [acceptColumnDrop, setAcceptColumnDrop] = useState<
      'none' | 'left' | 'right'
    >('none')

    const [edit, setEdit] = useState(false)

    const itemRef = useCallback((node: HTMLElement | null) => {
      node?.scrollIntoView({
        block: 'nearest',
      })
    }, [])

    const listRef = useRef<HTMLUListElement>(null!)

    function scrollList() {
      invariant(listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight
    }

    const updateColumnMutation = useUpdateColumnMutation()
    const deleteColumnMutation = useDeleteColumnMutation()
    const updateCardMutation = useUpdateCardMutation()

    const sortedItems = useMemo(
      () => [...items].sort((a, b) => a.order - b.order),
      [items],
    )

    const cardDndProps = {
      onDragOver: (event: React.DragEvent) => {
        if (event.dataTransfer.types.includes(CONTENT_TYPES.card)) {
          event.preventDefault()
          setAcceptCardDrop(true)
        }
      },
      onDragLeave: () => {
        setAcceptCardDrop(false)
      },
      onDrop: (event: React.DragEvent) => {
        const transfer = JSON.parse(
          event.dataTransfer.getData(CONTENT_TYPES.card) || 'null',
        )

        if (!transfer) {
          return
        }

        invariant(transfer.id, 'missing transfer.id')
        invariant(transfer.title, 'missing transfer.title')

        updateCardMutation.mutate({
          order: (sortedItems[sortedItems.length - 1]?.order ?? 0) + 1,
          columnId: columnId,
          boardId,
          id: transfer.id,
          title: transfer.title,
        })

        setAcceptCardDrop(false)
      },
    }

    return (
      <Box
        ref={ref}
        onDragOver={(event: React.DragEvent) => {
          if (event.dataTransfer.types.includes(CONTENT_TYPES.column)) {
            event.preventDefault()
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            const midpoint = (rect.left + rect.right) / 2
            setAcceptColumnDrop(event.clientX <= midpoint ? 'left' : 'right')
          }
        }}
        onDragLeave={() => {
          setAcceptColumnDrop('none')
        }}
        onDrop={(event: React.DragEvent) => {
          const transfer = JSON.parse(
            event.dataTransfer.getData(CONTENT_TYPES.column) || 'null',
          )

          if (!transfer) {
            return
          }

          invariant(transfer.id, 'missing transfer.id')

          const droppedOrder =
            acceptColumnDrop === 'left' ? previousOrder : nextOrder
          const moveOrder = (droppedOrder + order) / 2

          updateColumnMutation.mutate({
            boardId,
            id: transfer.id,
            order: moveOrder,
          })

          setAcceptColumnDrop('none')
        }}
        style={{
          borderLeft: `2px solid ${acceptColumnDrop === 'left' ? 'var(--mantine-color-red-5)' : 'transparent'}`,
          borderRight: `2px solid ${acceptColumnDrop === 'right' ? 'var(--mantine-color-red-5)' : 'transparent'}`,
          marginRight: -2,
          cursor: 'grab',
          padding: '0 8px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '100%',
        }}
      >
        <Paper
          draggable={!editState[0]}
          onDragStart={(event: React.DragEvent) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData(
              CONTENT_TYPES.column,
              JSON.stringify({ id: columnId, name }),
            )
          }}
          {...(!items.length ? cardDndProps : {})}
          shadow="xs"
          radius="lg"
          bg="dark.7"
          w={320}
          pos="relative"
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '100%',
            border: '1px solid var(--mantine-color-dark-5)',
            outline: acceptCardDrop ? '2px solid var(--mantine-color-red-5)' : 'none',
          }}
        >
          <Box p="sm" {...(items.length ? cardDndProps : {})}>
            <EditableText
              fieldName="name"
              editState={editState}
              value={
                // optimistic update
                updateColumnMutation.isPending &&
                updateColumnMutation.variables.name
                  ? updateColumnMutation.variables.name
                  : name
              }
              inputLabel="Edit column name"
              buttonLabel={`Edit column "${name}" name`}
              onChange={(value) => {
                updateColumnMutation.mutate({
                  boardId,
                  id: columnId,
                  name: value,
                })
              }}
            />
          </Box>

          <Box component="ul" ref={listRef} style={{ flexGrow: 1, overflow: 'auto', listStyle: 'none', margin: 0, padding: 0 }}>
            {sortedItems.map((item, index, items) => (
              <Card
                ref={itemRef}
                key={item.id}
                title={item.title}
                content={item.content ?? ''}
                id={item.id}
                boardId={boardId}
                order={item.order}
                columnId={columnId}
                previousOrder={items[index - 1] ? items[index - 1].order : 0}
                nextOrder={
                  items[index + 1] ? items[index + 1].order : item.order + 1
                }
              />
            ))}
          </Box>
          {edit ? (
            <NewCard
              columnId={columnId}
              boardId={boardId}
              nextOrder={
                items.length === 0 ? 1 : items[items.length - 1].order + 1
              }
              onComplete={() => setEdit(false)}
            />
          ) : (
            <Box p="sm" {...(items.length ? cardDndProps : {})}>
              <UnstyledButton
                type="button"
                onClick={() => {
                  flushSync(() => {
                    setEdit(true)
                  })
                  scrollList()
                }}
                w="100%"
                p="sm"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 'var(--mantine-radius-md)',
                  fontWeight: 500,
                  color: 'var(--mantine-color-gray-6)',
                }}
              >
                <IconPlus size={16} /> Add a card
              </UnstyledButton>
            </Box>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()

              deleteColumnMutation.mutate({
                id: columnId,
                boardId,
              })
            }}
          >
            <ActionIcon
              type="submit"
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Delete column"
              pos="absolute"
              top={16}
              right={16}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </form>
        </Paper>
      </Box>
    )
  },
)
