import { useCallback, useMemo, useRef } from 'react'
import { invariant } from '../invariant'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api.js'
import { useUpdateBoardMutation } from '../queries.js'
import { NewColumn } from './NewColumn.js'
import { Column as ColumnComponent } from './Column.js'
import type { Column } from 'convex/schema.js'
import { EditableText } from '~/components/EditableText.js'
import { Box, Flex, Title, ScrollArea } from '@mantine/core'

export function Board({ boardId }: { boardId: string }) {
  const newColumnAddedRef = useRef(false)
  const updateBoardMutation = useUpdateBoardMutation()
  const { data: board } = useSuspenseQuery(
    convexQuery(api.board.getBoard, { id: boardId }),
  )

  // scroll right when new columns are added
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const columnRef = useCallback((_node: HTMLElement | null) => {
    if (scrollContainerRef.current && newColumnAddedRef.current) {
      newColumnAddedRef.current = false
      scrollContainerRef.current.scrollLeft =
        scrollContainerRef.current.scrollWidth
    }
  }, [])

  const itemsById = useMemo(
    () => new Map(board.items.map((item) => [item.id, item])),
    [board.items],
  )

  type ColumnWithItems = Column & { items: typeof board.items }

  const columns = useMemo(() => {
    const columnsMap = new Map<string, ColumnWithItems>()

    for (const column of [...board.columns]) {
      columnsMap.set(column.id, { ...column, items: [] })
    }

    // add items to their columns
    for (const item of itemsById.values()) {
      const columnId = item.columnId
      const column = columnsMap.get(columnId)
      invariant(
        column,
        `missing column: ${columnId} from ${[...columnsMap.keys()]}`,
      )
      column.items.push(item)
    }

    return [...columnsMap.values()].sort((a, b) => a.order - b.order)
  }, [board.columns, itemsById])

  return (
    <Flex
      direction="column"
      ref={scrollContainerRef}
      style={{
        flexGrow: 1,
        minHeight: 0,
        overflowX: 'auto',
        backgroundColor: board.color,
      }}
    >
      <Title order={1} mx="xl" my="md">
        <EditableText
          value={
            // optimistic update
            updateBoardMutation.isPending && updateBoardMutation.variables.name
              ? updateBoardMutation.variables.name
              : board.name
          }
          fieldName="name"
          buttonLabel={`Edit board "${board.name}" name`}
          inputLabel="Edit board name"
          onChange={(value) => {
            updateBoardMutation.mutate({
              id: board.id,
              name: value,
            })
          }}
        />
      </Title>

      <Flex
        gap={0}
        align="flex-start"
        px="xl"
        pb="md"
        style={{ flexGrow: 1, minHeight: 0, height: '100%', width: 'fit-content' }}
      >
        {columns.map((col, index) => {
          return (
            <ColumnComponent
              ref={columnRef}
              key={col.id}
              name={col.name}
              columnId={col.id}
              boardId={board.id}
              items={col.items}
              order={col.order}
              previousOrder={columns[index - 1] ? columns[index - 1].order : 0}
              nextOrder={
                columns[index + 1] ? columns[index + 1].order : col.order + 1
              }
            />
          )
        })}
        <NewColumn
          boardId={board.id}
          editInitially={board.columns.length === 0}
          onNewColumnAdded={() => {
            newColumnAddedRef.current = true
          }}
        />
      </Flex>

      {/* trolling you to add some extra margin to the right of the container with a whole dang div */}
      <Box data-lol w={32} h={4} style={{ flexShrink: 0 }} />
    </Flex>
  )
}
