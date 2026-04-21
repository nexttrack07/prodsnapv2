import { useRef } from 'react'
import { invariant } from '../invariant'
import { Box, Textarea, Group } from '@mantine/core'

import { ItemMutationFields } from '../types'
import { useCreateItemMutation } from '../queries'
import { itemSchema } from '../db/schema'
import { SaveButton } from '~/components/SaveButton'
import { CancelButton } from '~/components/CancelButton'

export function NewCard({
  columnId,
  boardId,
  nextOrder,
  onComplete,
}: {
  columnId: string
  boardId: string
  nextOrder: number
  onComplete: () => void
}) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { mutate } = useCreateItemMutation()

  return (
    <form
      method="post"
      style={{
        padding: '4px 8px',
        borderTop: '2px solid transparent',
        borderBottom: '2px solid transparent',
      }}
      onSubmit={(event) => {
        event.preventDefault()

        const formData = new FormData(event.currentTarget)
        const id = crypto.randomUUID()
        formData.set(ItemMutationFields.id.name, id)

        invariant(textAreaRef.current)
        textAreaRef.current.value = ''

        mutate(itemSchema.parse(Object.fromEntries(formData.entries())))
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onComplete()
        }
      }}
    >
      <input type="hidden" name="boardId" value={boardId} />
      <input
        type="hidden"
        name={ItemMutationFields.columnId.name}
        value={columnId}
      />
      <input
        type="hidden"
        name={ItemMutationFields.order.name}
        value={nextOrder}
      />

      <Textarea
        autoFocus
        required
        ref={textAreaRef}
        name={ItemMutationFields.title.name}
        placeholder="Enter a title for this card"
        autosize
        minRows={2}
        styles={{
          input: {
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
            fontSize: 'var(--mantine-font-size-sm)',
            borderRadius: 'var(--mantine-radius-md)',
            resize: 'none',
          },
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            invariant(buttonRef.current, 'expected button ref')
            buttonRef.current.click()
          }
          if (event.key === 'Escape') {
            onComplete()
          }
        }}
      />
      <Group justify="space-between" mt="xs">
        <SaveButton ref={buttonRef}>Save Card</SaveButton>
        <CancelButton onClick={onComplete}>Cancel</CancelButton>
      </Group>
    </form>
  )
}
