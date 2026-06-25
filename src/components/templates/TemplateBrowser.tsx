/**
 * Shared template browser: the filter bar + infinite-scroll grid used by both
 * the /templates page and the starter "pick your ad styles" step. The caller
 * supplies `renderItem` so each surface can render its own tile (a save/preview
 * tile on /templates, a selectable tile in the starter) over the SAME filtered,
 * paginated data.
 */
import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useConvex } from 'convex/react'
import { useMediaQuery } from '@mantine/hooks'
import { Masonry } from 'masonic'
import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Select,
  Skeleton,
  Text,
  TextInput,
} from '@mantine/core'
import { IconSearch, IconX } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { capitalizeWords } from '../../utils/strings'

export type BrowserTemplate = {
  _id: Id<'adTemplates'>
  imageUrl: string
  thumbnailUrl: string
  aspectRatio: string
  name?: string
  productCategory?: string
  imageStyle?: string
  setting?: string
  composition?: string
  angleType?: string
}

function angleTypeLabel(type: string): string {
  return capitalizeWords(type.replace(/-/g, ' '))
}

export function TemplateBrowser({
  renderItem,
  initialCategory = null,
}: {
  renderItem: (t: BrowserTemplate) => ReactNode
  /** Optional default category filter (e.g. recommend by product category). */
  initialCategory?: string | null
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const convex = useConvex()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])
  const [filterCategory, setFilterCategory] = useState<string | null>(initialCategory)
  const [filterImageStyle, setFilterImageStyle] = useState<string | null>(null)
  const [filterSetting, setFilterSetting] = useState<string | null>(null)
  const [filterAngleType, setFilterAngleType] = useState<string | null>(null)
  const [filterAspectRatio, setFilterAspectRatio] = useState<string | null>(null)

  const { data: filterOptions } = useQuery(
    convexQuery(api.products.listTemplateFilterOptions, {}),
  )

  const filterArgs = {
    search: debouncedSearch.trim() || undefined,
    productCategory: filterCategory ?? undefined,
    imageStyle: filterImageStyle ?? undefined,
    setting: filterSetting ?? undefined,
    angleType: filterAngleType ?? undefined,
    aspectRatio:
      (filterAspectRatio as '1:1' | '4:5' | '9:16' | undefined) ?? undefined,
  }
  const filtersActive =
    !!search.trim() ||
    !!filterArgs.productCategory ||
    !!filterArgs.imageStyle ||
    !!filterArgs.setting ||
    !!filterArgs.angleType ||
    !!filterArgs.aspectRatio

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setFilterCategory(null)
    setFilterImageStyle(null)
    setFilterSetting(null)
    setFilterAngleType(null)
    setFilterAspectRatio(null)
  }

  const {
    data: templatesData,
    isLoading: templatesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'browseTemplates',
      filterArgs.search,
      filterArgs.productCategory,
      filterArgs.imageStyle,
      filterArgs.setting,
      filterArgs.angleType,
      filterArgs.aspectRatio,
    ],
    queryFn: async ({ pageParam }) =>
      convex.query(api.products.listTemplates, {
        cursor: pageParam,
        limit: 24,
        ...filterArgs,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  })

  const templates = (templatesData?.pages.flatMap((p) => p.items) ??
    []) as BrowserTemplate[]

  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect()
      if (!node) return
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage()
          }
        },
        { rootMargin: '400px' },
      )
      observerRef.current.observe(node)
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  )

  const filterKey = [
    filterArgs.search ?? '',
    filterArgs.productCategory ?? '',
    filterArgs.imageStyle ?? '',
    filterArgs.setting ?? '',
    filterArgs.angleType ?? '',
    filterArgs.aspectRatio ?? '',
  ].join('|')

  return (
    <>
      <Paper
        radius="md"
        p="md"
        mb="lg"
        style={{
          border: '1px solid var(--mantine-color-dark-5)',
          background: 'var(--mantine-color-dark-8)',
        }}
      >
        <Group gap="sm" wrap="wrap" align="flex-end">
          <TextInput
            placeholder="Search templates..."
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 180 }}
            size="sm"
          />
          <Select
            placeholder="Category"
            data={
              filterOptions?.productCategories.map((v) => ({
                value: v,
                label: capitalizeWords(v),
              })) ?? []
            }
            value={filterCategory}
            onChange={setFilterCategory}
            clearable
            size="sm"
            w={isMobile ? '100%' : 150}
          />
          <Select
            placeholder="Image style"
            data={
              filterOptions?.imageStyles.map((v) => ({
                value: v,
                label: capitalizeWords(v),
              })) ?? []
            }
            value={filterImageStyle}
            onChange={setFilterImageStyle}
            clearable
            size="sm"
            w={isMobile ? '100%' : 150}
          />
          <Select
            placeholder="Setting"
            data={
              filterOptions?.settings.map((v) => ({
                value: v,
                label: capitalizeWords(v),
              })) ?? []
            }
            value={filterSetting}
            onChange={setFilterSetting}
            clearable
            size="sm"
            w={isMobile ? '100%' : 150}
          />
          <Select
            placeholder="Angle type"
            data={
              filterOptions?.angleTypes.map((v) => ({
                value: v,
                label: angleTypeLabel(v),
              })) ?? []
            }
            value={filterAngleType}
            onChange={setFilterAngleType}
            clearable
            size="sm"
            w={isMobile ? '100%' : 150}
          />
          <Select
            placeholder="Aspect ratio"
            data={[
              { value: '1:1', label: '1:1' },
              { value: '4:5', label: '4:5' },
              { value: '9:16', label: '9:16' },
            ]}
            value={filterAspectRatio}
            onChange={setFilterAspectRatio}
            clearable
            size="sm"
            w={isMobile ? '100%' : 120}
          />
          {filtersActive && (
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<IconX size={14} />}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </Group>
      </Paper>

      {templatesLoading ? (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 1,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} h={i % 3 === 0 ? 240 : i % 3 === 1 ? 320 : 200} radius="sm" />
          ))}
        </Box>
      ) : templates.length === 0 ? (
        <Paper
          radius="lg"
          p={60}
          ta="center"
          withBorder
          style={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: 'var(--mantine-color-dark-5)',
          }}
        >
          <Text size="lg" fw={500} c="dark.1" mb="xs">
            No templates match
          </Text>
          <Text size="sm" c="dark.3">
            Try clearing a filter.
          </Text>
        </Paper>
      ) : (
        <>
          <Masonry
            key={filterKey}
            items={templates}
            columnCount={isMobile ? 2 : 4}
            columnGutter={1}
            rowGutter={1}
            render={({ data: t }) => <>{renderItem(t)}</>}
          />
          {hasNextPage && (
            <Center ref={loadMoreRef} py="xl">
              {isFetchingNextPage ? (
                <Loader size="sm" color="brand" />
              ) : (
                <Text size="sm" c="dark.3">
                  Scroll for more
                </Text>
              )}
            </Center>
          )}
        </>
      )}
    </>
  )
}
