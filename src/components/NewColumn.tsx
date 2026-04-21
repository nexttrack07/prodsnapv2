import { useRef, useState } from 'react'
import { invariant } from '../invariant'
import { Box, Paper, TextInput, Group, ActionIcon } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'

import { Icon } from '../icons/icons'
import { useCreateColumnMutation } from '../queries'
import { CancelButton } from '~/components/CancelButton'
import { SaveButton } from '~/components/SaveButton'

export function NewColumn({
  boardId,
  editInitially,
  onNewColumnAdded,
}: {
  boardId: string
  editInitially: boolean
  onNewColumnAdded: () => void
}) {
  const [editing, setEditing] = useState(editInitially)
  const inputRef = useRef<HTMLInputElement>(null)

  const newColumnMutation = useCreateColumnMutation()

  return editing ? (
    <Paper
      component="form"
      ml="sm"
      p="sm"
      w={320}
      shadow="sm"
      radius="lg"
      bg="dark.7"
      style={{ flexShrink: 0, maxHeight: '100%', overflow: 'hidden' }}
      onSubmit={(event) => {
        event.preventDefault()
        invariant(inputRef.current, 'missing input ref')

        newColumnMutation.mutate({
          boardId,
          name: inputRef.current.value,
        })

        inputRef.current.value = ''

        onNewColumnAdded()
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setEditing(false)
        }
      }}
    >
      <TextInput
        autoFocus
        required
        ref={inputRef}
        type="text"
        name="columnName"
        autoComplete="off"
        styles={{
          input: {
            border: '1px solid var(--mantine-color-dark-4)',
            fontWeight: 500,
          },
        }}
      />
      <Group justify="space-between" mt="md">
        <SaveButton>Save Column</SaveButton>
        <CancelButton onClick={() => setEditing(false)}>Cancel</CancelButton>
      </Group>
    </Paper>
  ) : (
    <ActionIcon
      onClick={() => setEditing(true)}
      aria-label="Add new column"
      variant="subtle"
      color="brand"
      size={64}
      radius="lg"
      ml="sm"
      style={{
        flexShrink: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
      }}
    >
      <IconPlus size={32} />
    </ActionIcon>
  )
}
