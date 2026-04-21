import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { TextInput, UnstyledButton, Text } from '@mantine/core'

export function EditableText({
  fieldName,
  value,
  inputClassName,
  inputLabel,
  buttonClassName,
  buttonLabel,
  onChange,
  editState,
}: {
  fieldName: string
  value: string
  inputClassName?: string
  inputLabel: string
  buttonClassName?: string
  buttonLabel: string
  onChange: (value: string) => void
  editState?: [boolean, (value: boolean) => void]
}) {
  const localEditState = useState(false)
  const [edit, setEdit] = editState || localEditState
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return edit ? (
    <form
      onSubmit={(event) => {
        event.preventDefault()

        onChange(inputRef.current!.value)

        flushSync(() => {
          setEdit(false)
        })

        buttonRef.current?.focus()
      }}
    >
      <TextInput
        required
        ref={inputRef}
        type="text"
        aria-label={inputLabel}
        name={fieldName}
        defaultValue={value}
        styles={{
          input: {
            border: '1px solid var(--mantine-color-gray-5)',
            borderRadius: 'var(--mantine-radius-md)',
            padding: '4px 8px',
            fontWeight: 500,
          },
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            flushSync(() => {
              setEdit(false)
            })
            buttonRef.current?.focus()
          }
        }}
        onBlur={(event) => {
          if (
            inputRef.current?.value !== value &&
            inputRef.current?.value.trim() !== ''
          ) {
            onChange(inputRef.current!.value)
          }
          setEdit(false)
        }}
      />
    </form>
  ) : (
    <UnstyledButton
      aria-label={buttonLabel}
      type="button"
      ref={buttonRef}
      onClick={() => {
        flushSync(() => {
          setEdit(true)
        })
        inputRef.current?.select()
      }}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        borderRadius: 'var(--mantine-radius-md)',
        padding: '4px 8px',
        fontWeight: 500,
        border: '1px solid transparent',
      }}
    >
      {value || <Text c="gray.5" fs="italic">Edit</Text>}
    </UnstyledButton>
  )
}
