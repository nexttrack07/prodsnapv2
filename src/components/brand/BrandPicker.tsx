/**
 * Compact brand picker for the product detail page.
 * Shows the currently associated brand and a dropdown to change it.
 */
import { useQuery, useMutation } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import {
  Badge,
  Group,
  Menu,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronDown, IconTag, IconCheck } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export function BrandPicker({
  productId,
  brandKitId,
}: {
  productId: Id<'products'>
  brandKitId?: Id<'brandKits'>
}) {
  const { data: brands } = useQuery(convexQuery(api.brandKits.listBrandKits, {}))
  const updateProduct = useConvexMutation(api.products.updateProduct)
  const updateMutation = useMutation({ mutationFn: updateProduct })
  const clearBrand = useConvexMutation(api.products.clearProductBrand)
  const clearMutation = useMutation({ mutationFn: clearBrand })

  // Hide entirely if user has no brands
  if (!brands || brands.length === 0) return null

  const currentBrand = brandKitId
    ? brands.find((b) => b._id === brandKitId)
    : null

  async function handleSelect(id: Id<'brandKits'>) {
    try {
      await updateMutation.mutateAsync({ productId, brandKitId: id })
    } catch (err) {
      notifications.show({
        title: 'Failed to set brand',
        message: err instanceof Error ? err.message : 'Unknown error',
        color: 'red',
      })
    }
  }

  async function handleClear() {
    try {
      await clearMutation.mutateAsync({ productId })
    } catch (err) {
      notifications.show({
        title: 'Failed to remove brand',
        message: err instanceof Error ? err.message : 'Unknown error',
        color: 'red',
      })
    }
  }

  return (
    <Group gap={6}>
      <IconTag size={13} color="var(--mantine-color-dark-2)" />
      <Text size="xs" tt="uppercase" fw={700} c="dark.2">
        Brand
      </Text>
      <Menu shadow="md" width={220} position="bottom-start">
        <Menu.Target>
          <UnstyledButton>
            <Group gap={4}>
              {currentBrand ? (
                <Badge
                  size="sm"
                  variant="light"
                  color="brand"
                  radius="sm"
                  rightSection={<IconChevronDown size={10} />}
                  style={{ cursor: 'pointer' }}
                >
                  {currentBrand.name || currentBrand.websiteUrl || 'Unnamed brand'}
                </Badge>
              ) : (
                <Badge
                  size="sm"
                  variant="outline"
                  color="gray"
                  radius="sm"
                  rightSection={<IconChevronDown size={10} />}
                  style={{ cursor: 'pointer' }}
                >
                  No brand
                </Badge>
              )}
            </Group>
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Label>Select a brand</Menu.Label>
          {brands.map((brand) => (
            <Menu.Item
              key={brand._id}
              leftSection={
                brand._id === brandKitId ? (
                  <IconCheck size={14} color="var(--mantine-color-brand-5)" />
                ) : undefined
              }
              onClick={() => handleSelect(brand._id)}
            >
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" truncate>
                  {brand.name || brand.websiteUrl || 'Unnamed brand'}
                </Text>
                {brand.isPrimary && (
                  <Badge size="xs" variant="light" color="brand">
                    Primary
                  </Badge>
                )}
              </Group>
            </Menu.Item>
          ))}
          {brandKitId && (
            <>
              <Menu.Divider />
              <Menu.Item color="red" onClick={handleClear}>
                Remove brand
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
