/**
 * Renders blog post markdown into styled, safe HTML.
 *
 * react-markdown does NOT render raw HTML by default and sanitizes URLs
 * (blocks javascript: etc.), so there's no XSS surface from the content even
 * though it's machine-generated upstream. Mantine's TypographyStylesProvider
 * gives it readable "prose" styling (headings, lists, quotes, code, tables).
 */
import { Box } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function BlogMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="blog-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) =>
            src ? (
              <Box
                component="img"
                src={src}
                alt={alt ?? ''}
                loading="lazy"
                my="lg"
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                  borderRadius: 12,
                  border: '1px solid var(--mantine-color-dark-6)',
                }}
              />
            ) : null,
          a: ({ href, children }) => {
            const external = !!href && /^https?:\/\//i.test(href)
            return (
              <a
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
                style={{ color: 'var(--mantine-color-brand-4)' }}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
